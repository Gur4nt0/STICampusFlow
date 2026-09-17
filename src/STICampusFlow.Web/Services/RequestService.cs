using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using STICampusFlow.Web.Data;
using STICampusFlow.Web.Models;
using STICampusFlow.Web.Models.Entities;

namespace STICampusFlow.Web.Services;

/// <summary>One line the student picked on the document screen.</summary>
public record RequestLine(int DocumentTypeId, int Copies);

/// <summary>Outcome of a create/transition attempt.</summary>
public class RequestResult
{
    public bool Success { get; init; }
    public DocumentRequest? Request { get; init; }
    public List<string> Errors { get; init; } = new();

    public string FirstError => Errors.FirstOrDefault() ?? "Something went wrong.";

    public static RequestResult Ok(DocumentRequest r) => new() { Success = true, Request = r };
    public static RequestResult Fail(params string[] errors) => new() { Success = false, Errors = errors.ToList() };
    public static RequestResult Fail(IEnumerable<string> errors) => new() { Success = false, Errors = errors.ToList() };
}

public interface IRequestService
{
    Task<RequestResult> CreateAsync(int studentId, DateTime date, TimeSpan slotStart,
        IEnumerable<RequestLine> lines, string? purpose, string? note, CancellationToken ct = default);

    Task<RequestResult> TransitionAsync(int requestId, RequestStatus target, int staffUserId,
        string? note, CancellationToken ct = default);

    Task<RequestResult> CancelByStudentAsync(int requestId, int studentId, CancellationToken ct = default);

    Task<DocumentRequest?> GetDetailAsync(int requestId, CancellationToken ct = default);
    Task<DocumentRequest?> GetByReferenceAsync(string referenceCode, CancellationToken ct = default);

    Task<int> MarkMissedAppointmentsAsync(CancellationToken ct = default);
}

public class RequestService : IRequestService
{
    private readonly AppDbContext _db;
    private readonly ISchedulingService _scheduling;
    private readonly INotificationService _notifications;
    private readonly RegistrarOptions _opt;
    private readonly ILogger<RequestService> _log;

    public RequestService(AppDbContext db, ISchedulingService scheduling, INotificationService notifications,
        IOptions<RegistrarOptions> options, ILogger<RequestService> log)
    {
        _db = db;
        _scheduling = scheduling;
        _notifications = notifications;
        _opt = options.Value;
        _log = log;
    }

    // ---------------------------------------------------------------------
    // Create
    // ---------------------------------------------------------------------

    public async Task<RequestResult> CreateAsync(int studentId, DateTime date, TimeSpan slotStart,
        IEnumerable<RequestLine> lines, string? purpose, string? note, CancellationToken ct = default)
    {
        var lineList = lines
            .Where(l => l.Copies > 0)
            .GroupBy(l => l.DocumentTypeId)                       // merge duplicates instead of failing
            .Select(g => new RequestLine(g.Key, g.Sum(x => x.Copies)))
            .ToList();

        if (lineList.Count == 0)
            return RequestResult.Fail("Select at least one document to request.");

        // --- Validate the documents themselves ---
        var ids = lineList.Select(l => l.DocumentTypeId).ToList();
        var docs = await _db.DocumentTypes
            .Where(d => ids.Contains(d.Id) && d.IsActive)
            .ToListAsync(ct);

        if (docs.Count != lineList.Count)
            return RequestResult.Fail("One of the selected documents is no longer offered. Please review your selection.");

        var copyErrors = new List<string>();
        foreach (var line in lineList)
        {
            var doc = docs.First(d => d.Id == line.DocumentTypeId);
            if (line.Copies > doc.MaxCopies)
                copyErrors.Add($"{doc.Name}: maximum of {doc.MaxCopies} copies per request.");
        }
        if (copyErrors.Count > 0) return RequestResult.Fail(copyErrors);

        // --- Validate the appointment against every office rule ---
        var validation = await _scheduling.ValidateBookingAsync(studentId, date, slotStart, null, ct);
        if (!validation.IsValid)
            return RequestResult.Fail(validation.Errors);

        // --- Build the request ---
        var request = new DocumentRequest
        {
            ReferenceCode = await GenerateUniqueReferenceAsync(ct),
            StudentId = studentId,
            AppointmentDate = date.Date,
            SlotStart = slotStart,
            SlotEnd = _scheduling.GetSlotEnd(slotStart),
            Status = RequestStatus.Pending,
            Purpose = Trim(purpose, 400),
            StudentNote = Trim(note, 600),
            CreatedAt = DateTime.Now,
            UpdatedAt = DateTime.Now
        };

        foreach (var line in lineList)
        {
            var doc = docs.First(d => d.Id == line.DocumentTypeId);
            request.Items.Add(new RequestItem
            {
                DocumentTypeId = doc.Id,
                Copies = line.Copies,
                UnitFee = doc.Fee
            });
        }

        request.TotalFee = request.Items.Sum(i => i.UnitFee * i.Copies);

        request.History.Add(new StatusHistory
        {
            FromStatus = null,
            ToStatus = RequestStatus.Pending,
            ChangedByUserId = studentId,
            Note = "Request submitted by the student.",
            ChangedAt = DateTime.Now
        });

        _db.DocumentRequests.Add(request);

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex)
        {
            // The unique index on ReferenceCode is the last line of defence against a
            // collision between two students submitting at the same instant.
            _log.LogError(ex, "Failed to save request for student {StudentId}", studentId);
            return RequestResult.Fail("We could not save your request. Please try again.");
        }

        await NotifyRegistrarAsync(request, ct);

        return RequestResult.Ok(request);
    }

    // ---------------------------------------------------------------------
    // Status transitions (registrar side)
    // ---------------------------------------------------------------------

    public async Task<RequestResult> TransitionAsync(int requestId, RequestStatus target, int staffUserId,
        string? note, CancellationToken ct = default)
    {
        var request = await _db.DocumentRequests
            .Include(r => r.Student)
            .Include(r => r.Items).ThenInclude(i => i.DocumentType)
            .FirstOrDefaultAsync(r => r.Id == requestId, ct);

        if (request is null)
            return RequestResult.Fail("That request no longer exists.");

        // Guard: only the transitions declared on the enum are legal.
        if (!request.Status.AllowedNextStatuses().Contains(target))
            return RequestResult.Fail(
                $"A request that is \"{request.Status.ToDisplayName()}\" cannot be moved to \"{target.ToDisplayName()}\".");

        if (target == RequestStatus.Rejected && string.IsNullOrWhiteSpace(note))
            return RequestResult.Fail("A reason is required when rejecting a request.");

        var from = request.Status;
        var now = DateTime.Now;

        request.Status = target;
        request.UpdatedAt = now;
        request.ProcessedByUserId = staffUserId;
        request.StaffNote = Trim(note, 600) ?? request.StaffNote;

        switch (target)
        {
            case RequestStatus.Approved:
                request.ApprovedAt = now;
                break;
            case RequestStatus.ReadyForPickup:
                request.ReadyAt = now;
                break;
            case RequestStatus.Released:
                request.ReleasedAt = now;
                break;
            case RequestStatus.Rejected:
                request.RejectionReason = Trim(note, 400);
                break;
        }

        request.History.Add(new StatusHistory
        {
            FromStatus = from,
            ToStatus = target,
            ChangedByUserId = staffUserId,
            Note = Trim(note, 400),
            ChangedAt = now
        });

        await _db.SaveChangesAsync(ct);

        await _notifications.PushAsync(
            request.StudentId,
            StudentNotificationTitle(target),
            StudentNotificationBody(request, target, note),
            $"/Student/Details/{request.Id}",
            ct);

        _log.LogInformation("Request {Ref} moved {From} -> {To} by staff {StaffId}",
            request.ReferenceCode, from, target, staffUserId);

        return RequestResult.Ok(request);
    }

    // ---------------------------------------------------------------------
    // Student cancellation
    // ---------------------------------------------------------------------

    public async Task<RequestResult> CancelByStudentAsync(int requestId, int studentId, CancellationToken ct = default)
    {
        var request = await _db.DocumentRequests
            .Include(r => r.Items)
            .FirstOrDefaultAsync(r => r.Id == requestId, ct);

        if (request is null)
            return RequestResult.Fail("That request no longer exists.");

        // Ownership check — a student may never touch someone else's request.
        if (request.StudentId != studentId)
            return RequestResult.Fail("You are not allowed to change this request.");

        if (!request.CanBeCancelledByStudent)
            return RequestResult.Fail(
                "This request can no longer be cancelled online. Please visit the registrar counter instead.");

        var from = request.Status;
        request.Status = RequestStatus.Cancelled;
        request.UpdatedAt = DateTime.Now;

        request.History.Add(new StatusHistory
        {
            FromStatus = from,
            ToStatus = RequestStatus.Cancelled,
            ChangedByUserId = studentId,
            Note = "Cancelled by the student.",
            ChangedAt = DateTime.Now
        });

        await _db.SaveChangesAsync(ct);
        return RequestResult.Ok(request);
    }

    // ---------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------

    public Task<DocumentRequest?> GetDetailAsync(int requestId, CancellationToken ct = default) =>
        _db.DocumentRequests
            .Include(r => r.Student)
            .Include(r => r.ProcessedBy)
            .Include(r => r.Items).ThenInclude(i => i.DocumentType)
            .Include(r => r.History).ThenInclude(h => h.ChangedBy)
            .AsSplitQuery()
            .FirstOrDefaultAsync(r => r.Id == requestId, ct);

    public Task<DocumentRequest?> GetByReferenceAsync(string referenceCode, CancellationToken ct = default)
    {
        var code = (referenceCode ?? string.Empty).Trim().ToUpperInvariant();
        return _db.DocumentRequests
            .Include(r => r.Student)
            .Include(r => r.Items).ThenInclude(i => i.DocumentType)
            .Include(r => r.History)
            .AsSplitQuery()
            .FirstOrDefaultAsync(r => r.ReferenceCode == code, ct);
    }

    /// <summary>
    /// Housekeeping: appointments that were never claimed are voided at the end of the day,
    /// which frees the slot statistics and matches the campus policy on missed schedules.
    /// </summary>
    public async Task<int> MarkMissedAppointmentsAsync(CancellationToken ct = default)
    {
        if (!_opt.AutoVoidMissedAppointments) return 0;

        var cutoff = DateTime.Today;

        var stale = await _db.DocumentRequests
            .Where(r => r.AppointmentDate < cutoff &&
                        (r.Status == RequestStatus.Pending ||
                         r.Status == RequestStatus.Approved ||
                         r.Status == RequestStatus.ReadyForPickup))
            .ToListAsync(ct);

        foreach (var request in stale)
        {
            var from = request.Status;
            request.Status = RequestStatus.NoShow;
            request.UpdatedAt = DateTime.Now;
            request.History.Add(new StatusHistory
            {
                FromStatus = from,
                ToStatus = RequestStatus.NoShow,
                ChangedByUserId = null,
                Note = "Automatically voided — the appointment date passed without a release.",
                ChangedAt = DateTime.Now
            });
        }

        if (stale.Count > 0)
        {
            await _db.SaveChangesAsync(ct);
            _log.LogInformation("Auto-voided {Count} missed appointment(s).", stale.Count);
        }

        return stale.Count;
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    private async Task<string> GenerateUniqueReferenceAsync(CancellationToken ct)
    {
        for (var attempt = 0; attempt < 8; attempt++)
        {
            var code = ReferenceCodeGenerator.Next();
            if (!await _db.DocumentRequests.AnyAsync(r => r.ReferenceCode == code, ct))
                return code;
        }

        // Astronomically unlikely; fall back to something guaranteed unique.
        return $"CF-{DateTime.Now:yyMMddHHmmss}";
    }

    private async Task NotifyRegistrarAsync(DocumentRequest request, CancellationToken ct)
    {
        var staffIds = await _db.Users
            .Where(u => u.IsActive && (u.Role == UserRole.RegistrarStaff || u.Role == UserRole.RegistrarHead))
            .Select(u => u.Id)
            .ToListAsync(ct);

        foreach (var staffId in staffIds)
        {
            _db.Notifications.Add(new Notification
            {
                UserId = staffId,
                Title = "New document request",
                Message = $"{request.Student?.FullName ?? "A student"} booked {request.AppointmentDate:MMM d} " +
                          $"at {DateTime.Today.Add(request.SlotStart):h:mm tt} ({request.ReferenceCode}).",
                Link = $"/Registrar/Details/{request.Id}",
                CreatedAt = DateTime.Now
            });
        }

        if (staffIds.Count > 0)
            await _db.SaveChangesAsync(ct);
    }

    private static string StudentNotificationTitle(RequestStatus status) => status switch
    {
        RequestStatus.Approved => "Your request was approved",
        RequestStatus.Processing => "Your document is being prepared",
        RequestStatus.ReadyForPickup => "Your document is ready for pickup",
        RequestStatus.Released => "Document released",
        RequestStatus.Rejected => "Your request was declined",
        RequestStatus.NoShow => "Appointment marked as missed",
        _ => "Request updated"
    };

    private static string StudentNotificationBody(DocumentRequest r, RequestStatus status, string? note) => status switch
    {
        RequestStatus.Approved =>
            $"{r.ReferenceCode} is confirmed for {r.AppointmentDate:MMMM d} at {DateTime.Today.Add(r.SlotStart):h:mm tt}. " +
            "Bring your student ID and your claim slip.",
        RequestStatus.Processing =>
            $"The registrar has started preparing the documents for {r.ReferenceCode}.",
        RequestStatus.ReadyForPickup =>
            $"{r.ReferenceCode} is ready at the registrar counter. Claim it on your appointment date.",
        RequestStatus.Released =>
            $"{r.ReferenceCode} was released. Thank you!",
        RequestStatus.Rejected =>
            $"{r.ReferenceCode} was declined. Reason: {note}",
        RequestStatus.NoShow =>
            $"{r.ReferenceCode} was marked as missed. Please book a new appointment.",
        _ => $"{r.ReferenceCode} is now {status.ToDisplayName()}."
    };

    private static string? Trim(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        value = value.Trim();
        return value.Length <= max ? value : value[..max];
    }
}
