using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using STICampusFlow.Web.Data;
using STICampusFlow.Web.Models;
using STICampusFlow.Web.Models.Entities;
using STICampusFlow.Web.Models.ViewModels;
using STICampusFlow.Web.Services;

namespace STICampusFlow.Web.Controllers;

[Authorize(Policy = "RegistrarOnly")]
public class RegistrarController : BaseController
{
    private readonly IRequestService _requests;
    private readonly ISchedulingService _scheduling;
    private readonly INotificationService _notifications;
    private readonly RegistrarOptions _opt;

    public RegistrarController(AppDbContext db, IRequestService requests, ISchedulingService scheduling,
        INotificationService notifications, IOptions<RegistrarOptions> options) : base(db)
    {
        _requests = requests;
        _scheduling = scheduling;
        _notifications = notifications;
        _opt = options.Value;
    }

    // =================================================================
    // Dashboard
    // =================================================================

    public async Task<IActionResult> Index()
    {
        var me = await GetCurrentUserAsync();
        if (me is null) return Challenge();

        var today = DateTime.Today;
        var weekStart = today.AddDays(-(int)today.DayOfWeek);
        var monthStart = new DateTime(today.Year, today.Month, 1);

        var manifest = await Db.DocumentRequests
            .Include(r => r.Student)
            .Include(r => r.Items).ThenInclude(i => i.DocumentType)
            .Where(r => r.AppointmentDate == today && r.Status != RequestStatus.Cancelled)
            .OrderBy(r => r.SlotStart)
            .ToListAsync();

        var oldestPending = await Db.DocumentRequests
            .Include(r => r.Student)
            .Include(r => r.Items).ThenInclude(i => i.DocumentType)
            .Where(r => r.Status == RequestStatus.Pending)
            .OrderBy(r => r.CreatedAt)
            .Take(6)
            .ToListAsync();

        var activity = await Db.StatusHistories
            .Include(h => h.ChangedBy)
            .Include(h => h.DocumentRequest).ThenInclude(r => r.Student)
            .OrderByDescending(h => h.ChangedAt)
            .Take(8)
            .ToListAsync();

        var liveStatuses = new[]
        {
            RequestStatus.Pending, RequestStatus.Approved,
            RequestStatus.Processing, RequestStatus.ReadyForPickup
        };

        var topDocs = await Db.RequestItems
            .Include(i => i.DocumentType)
            .Where(i => liveStatuses.Contains(i.DocumentRequest.Status))
            .GroupBy(i => new { i.DocumentType.Code, i.DocumentType.Name })
            .Select(g => new { g.Key.Code, g.Key.Name, Count = g.Count() })
            .OrderByDescending(x => x.Count)
            .Take(5)
            .ToListAsync();

        var vm = new RegistrarDashboardViewModel
        {
            Staff = me,
            TodayManifest = manifest,
            OldestPending = oldestPending,
            RecentActivity = activity,
            PendingCount = await Db.DocumentRequests.CountAsync(r => r.Status == RequestStatus.Pending),
            TodayCount = manifest.Count,
            ReadyCount = await Db.DocumentRequests.CountAsync(r => r.Status == RequestStatus.ReadyForPickup),
            ReleasedThisWeek = await Db.DocumentRequests
                .CountAsync(r => r.Status == RequestStatus.Released && r.ReleasedAt >= weekStart),
            FeesCollectedThisMonth = await Db.DocumentRequests
                .Where(r => r.Status == RequestStatus.Released && r.ReleasedAt >= monthStart)
                .SumAsync(r => (decimal?)r.TotalFee) ?? 0m,
            TopDocuments = topDocs.Select(x => (x.Code, x.Name, x.Count)).ToList(),
            TodaySlots = (await _scheduling.GetSlotsAsync(today)).ToList()
        };

        return View(vm);
    }

    // =================================================================
    // Queue — search, filter, sort, page
    // =================================================================

    public async Task<IActionResult> Queue(string? search, string status = "open",
        DateTime? from = null, DateTime? to = null, int? documentTypeId = null,
        string sort = "date", int page = 1)
    {
        var query = Db.DocumentRequests
            .Include(r => r.Student)
            .Include(r => r.Items).ThenInclude(i => i.DocumentType)
            .AsQueryable();

        // --- Search by name, student number or reference code ---
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(r =>
                r.Student.FullName.Contains(term) ||
                r.Student.LoginId.Contains(term) ||
                r.ReferenceCode.Contains(term));
        }

        // --- Status filter ---
        query = status switch
        {
            "pending" => query.Where(r => r.Status == RequestStatus.Pending),
            "approved" => query.Where(r => r.Status == RequestStatus.Approved),
            "processing" => query.Where(r => r.Status == RequestStatus.Processing),
            "ready" => query.Where(r => r.Status == RequestStatus.ReadyForPickup),
            "released" => query.Where(r => r.Status == RequestStatus.Released),
            "rejected" => query.Where(r => r.Status == RequestStatus.Rejected),
            "open" => query.Where(r => r.Status == RequestStatus.Pending || r.Status == RequestStatus.Approved
                                       || r.Status == RequestStatus.Processing || r.Status == RequestStatus.ReadyForPickup),
            _ => query
        };

        if (from.HasValue) query = query.Where(r => r.AppointmentDate >= from.Value.Date);
        if (to.HasValue) query = query.Where(r => r.AppointmentDate <= to.Value.Date);

        if (documentTypeId.HasValue)
            query = query.Where(r => r.Items.Any(i => i.DocumentTypeId == documentTypeId.Value));

        // --- Sorting ---
        query = sort switch
        {
            "name" => query.OrderBy(r => r.Student.FullName).ThenBy(r => r.AppointmentDate),
            "status" => query.OrderBy(r => r.Status).ThenBy(r => r.AppointmentDate),
            "submitted" => query.OrderByDescending(r => r.CreatedAt),
            "oldest" => query.OrderBy(r => r.AppointmentDate).ThenBy(r => r.SlotStart),
            _ => query.OrderBy(r => r.AppointmentDate).ThenBy(r => r.SlotStart)
        };

        const int pageSize = 20;
        page = Math.Max(1, page);
        var total = await query.CountAsync();

        var vm = new RegistrarQueueViewModel
        {
            Search = search,
            Status = status,
            FromDate = from,
            ToDate = to,
            DocumentTypeId = documentTypeId,
            Sort = sort,
            Page = page,
            PageSize = pageSize,
            TotalCount = total,
            Requests = await query.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(),
            DocumentTypes = await Db.DocumentTypes.Where(d => d.IsActive).OrderBy(d => d.SortOrder).ToListAsync(),
            CountAll = await Db.DocumentRequests.CountAsync(),
            CountPending = await Db.DocumentRequests.CountAsync(r => r.Status == RequestStatus.Pending),
            CountReady = await Db.DocumentRequests.CountAsync(r => r.Status == RequestStatus.ReadyForPickup)
        };

        return View(vm);
    }

    // =================================================================
    // Request detail + actions
    // =================================================================

    public async Task<IActionResult> Details(int id)
    {
        var request = await _requests.GetDetailAsync(id);
        if (request is null) return NotFound();

        // Other requests by the same student, for context at the counter.
        ViewBag.StudentHistory = await Db.DocumentRequests
            .Where(r => r.StudentId == request.StudentId && r.Id != request.Id)
            .OrderByDescending(r => r.AppointmentDate)
            .Take(5)
            .ToListAsync();

        return View(request);
    }

    [HttpPost]
    public async Task<IActionResult> Approve(int id, string? note)
        => await TransitionAsync(id, RequestStatus.Approved, note, "Request approved.");

    [HttpPost]
    public async Task<IActionResult> Reject(int id, string? note)
        => await TransitionAsync(id, RequestStatus.Rejected, note, "Request rejected and the student was notified.");

    [HttpPost]
    public async Task<IActionResult> StartProcessing(int id, string? note)
        => await TransitionAsync(id, RequestStatus.Processing, note, "Marked as processing.");

    [HttpPost]
    public async Task<IActionResult> MarkReady(int id, string? note)
        => await TransitionAsync(id, RequestStatus.ReadyForPickup, note, "Marked ready for pickup.");

    [HttpPost]
    public async Task<IActionResult> Release(int id, string? note)
        => await TransitionAsync(id, RequestStatus.Released, note, "Document released.");

    [HttpPost]
    public async Task<IActionResult> MarkNoShow(int id, string? note)
        => await TransitionAsync(id, RequestStatus.NoShow, note, "Marked as a no-show.");

    private async Task<IActionResult> TransitionAsync(int id, RequestStatus target, string? note, string successMessage)
    {
        var result = await _requests.TransitionAsync(id, target, CurrentUserId, note);

        if (result.Success) Flash(successMessage);
        else Flash(result.FirstError, "error");

        return RedirectToAction(nameof(Details), new { id });
    }

    /// <summary>Approve several pending requests from the queue in one action.</summary>
    [HttpPost]
    public async Task<IActionResult> BulkApprove(int[] ids, string? returnUrl = null)
    {
        var ok = 0;
        var failed = 0;

        foreach (var id in ids ?? Array.Empty<int>())
        {
            var result = await _requests.TransitionAsync(id, RequestStatus.Approved, CurrentUserId,
                "Approved in bulk from the queue.");

            if (result.Success) ok++; else failed++;
        }

        if (ok > 0) Flash($"Approved {ok} request(s)." + (failed > 0 ? $" {failed} could not be approved." : ""));
        else if (failed > 0) Flash("None of the selected requests could be approved.", "error");
        else Flash("Select at least one request first.", "warning");

        return Redirect(Url.IsLocalUrl(returnUrl) ? returnUrl! : Url.Action(nameof(Queue))!);
    }

    // =================================================================
    // Daily manifest
    // =================================================================

    public async Task<IActionResult> Manifest(DateTime? date = null)
    {
        var day = (date ?? DateTime.Today).Date;

        var requests = await Db.DocumentRequests
            .Include(r => r.Student)
            .Include(r => r.Items).ThenInclude(i => i.DocumentType)
            .Where(r => r.AppointmentDate == day && r.Status != RequestStatus.Cancelled)
            .OrderBy(r => r.SlotStart)
            .ThenBy(r => r.Student.FullName)
            .ToListAsync();

        var closure = await Db.BlockedDates.FirstOrDefaultAsync(b => b.Date == day);

        return View(new ManifestViewModel
        {
            Date = day,
            BySlot = requests.GroupBy(r => r.SlotStart).OrderBy(g => g.Key).ToList(),
            Total = requests.Count,
            ExpectedFees = requests.Where(r => r.Status.IsOpen()).Sum(r => r.TotalFee),
            ClosureReason = closure?.Reason,
            Slots = (await _scheduling.GetSlotsAsync(day)).ToList(),
            OfficeName = _opt.OfficeName,
            CampusName = _opt.CampusName
        });
    }

    /// <summary>Downloadable CSV of the day's manifest, for the DBA's reporting chapter.</summary>
    public async Task<IActionResult> ManifestCsv(DateTime? date = null)
    {
        var day = (date ?? DateTime.Today).Date;

        var requests = await Db.DocumentRequests
            .Include(r => r.Student)
            .Include(r => r.Items).ThenInclude(i => i.DocumentType)
            .Where(r => r.AppointmentDate == day && r.Status != RequestStatus.Cancelled)
            .OrderBy(r => r.SlotStart)
            .ToListAsync();

        var sb = new System.Text.StringBuilder();
        sb.AppendLine("Reference,Time,Student Number,Student Name,Program,Documents,Copies,Fee,Status");

        foreach (var r in requests)
        {
            var docs = string.Join("; ", r.Items.Select(i => $"{i.DocumentType.Code} x{i.Copies}"));
            sb.AppendLine(string.Join(',',
                Csv(r.ReferenceCode),
                Csv(DateTime.Today.Add(r.SlotStart).ToString("hh\\:mm tt")),
                Csv(r.Student.LoginId),
                Csv(r.Student.FullName),
                Csv(r.Student.Program ?? ""),
                Csv(docs),
                r.TotalCopies,
                r.TotalFee.ToString("0.00"),
                Csv(r.Status.ToDisplayName())));
        }

        return File(System.Text.Encoding.UTF8.GetBytes(sb.ToString()),
            "text/csv", $"manifest-{day:yyyy-MM-dd}.csv");
    }

    private static string Csv(string value) =>
        value.Contains(',') || value.Contains('"')
            ? $"\"{value.Replace("\"", "\"\"")}\""
            : value;

    /// <summary>Staff copy of the claim slip, printed when the document is released.</summary>
    public async Task<IActionResult> Slip(int id)
    {
        var request = await _requests.GetDetailAsync(id);
        if (request is null) return NotFound();

        return View("~/Views/Shared/Slip.cshtml", new SlipViewModel
        {
            Request = request,
            OfficeName = _opt.OfficeName,
            CampusName = _opt.CampusName,
            IsStaffCopy = true
        });
    }

    // =================================================================
    // Capacity and closure management
    // =================================================================

    public async Task<IActionResult> Schedule()
    {
        return View(await BuildScheduleViewModelAsync());
    }

    [HttpPost]
    public async Task<IActionResult> BlockDate(DateTime? newBlockedDate, string? newBlockedReason)
    {
        if (!newBlockedDate.HasValue)
        {
            Flash("Choose a date to close.", "warning");
            return RedirectToAction(nameof(Schedule));
        }

        if (string.IsNullOrWhiteSpace(newBlockedReason))
        {
            Flash("Give a reason so students understand why the date is closed.", "warning");
            return RedirectToAction(nameof(Schedule));
        }

        var day = newBlockedDate.Value.Date;

        if (await Db.BlockedDates.AnyAsync(b => b.Date == day))
        {
            Flash($"{day:MMMM d, yyyy} is already closed.", "warning");
            return RedirectToAction(nameof(Schedule));
        }

        Db.BlockedDates.Add(new BlockedDate
        {
            Date = day,
            Reason = newBlockedReason.Trim(),
            CreatedByUserId = CurrentUserId,
            CreatedAt = DateTime.Now
        });
        await Db.SaveChangesAsync();

        // Warn about appointments that were already booked on that date.
        var affected = await Db.DocumentRequests
            .Include(r => r.Student)
            .Where(r => r.AppointmentDate == day && r.Status != RequestStatus.Cancelled
                        && r.Status != RequestStatus.Released)
            .ToListAsync();

        foreach (var request in affected)
        {
            await _notifications.PushAsync(request.StudentId,
                "Your appointment date is now closed",
                $"The office will be closed on {day:MMMM d, yyyy} ({newBlockedReason.Trim()}). " +
                $"Please rebook {request.ReferenceCode}.",
                $"/Student/Details/{request.Id}");
        }

        Flash(affected.Count == 0
            ? $"{day:MMMM d, yyyy} is now closed for appointments."
            : $"{day:MMMM d, yyyy} is now closed. {affected.Count} student(s) with existing appointments were notified.");

        return RedirectToAction(nameof(Schedule));
    }

    [HttpPost]
    public async Task<IActionResult> UnblockDate(int id)
    {
        var blocked = await Db.BlockedDates.FindAsync(id);
        if (blocked is not null)
        {
            Db.BlockedDates.Remove(blocked);
            await Db.SaveChangesAsync();
            Flash($"{blocked.Date:MMMM d, yyyy} is open for appointments again.");
        }

        return RedirectToAction(nameof(Schedule));
    }

    [HttpPost]
    public async Task<IActionResult> SetCapacity(DateTime? newCapacityDate, string? newCapacitySlot, int newCapacityValue)
    {
        if (!newCapacityDate.HasValue)
        {
            Flash("Choose the date whose capacity you want to change.", "warning");
            return RedirectToAction(nameof(Schedule));
        }

        if (newCapacityValue < 0 || newCapacityValue > 200)
        {
            Flash("Capacity must be between 0 and 200.", "warning");
            return RedirectToAction(nameof(Schedule));
        }

        var day = newCapacityDate.Value.Date;
        TimeSpan? slot = TimeSpan.TryParse(newCapacitySlot, out var parsed) ? parsed : null;

        var existing = await Db.SlotCapacities.FirstOrDefaultAsync(c => c.Date == day && c.SlotStart == slot);

        if (existing is not null)
        {
            existing.Capacity = newCapacityValue;
        }
        else
        {
            Db.SlotCapacities.Add(new SlotCapacity
            {
                Date = day,
                SlotStart = slot,
                Capacity = newCapacityValue,
                CreatedByUserId = CurrentUserId,
                CreatedAt = DateTime.Now
            });
        }

        await Db.SaveChangesAsync();

        Flash(slot.HasValue
            ? $"The {DateTime.Today.Add(slot.Value):h:mm tt} window on {day:MMM d} now holds {newCapacityValue} student(s)."
            : $"Every window on {day:MMM d} now holds {newCapacityValue} student(s).");

        return RedirectToAction(nameof(Schedule));
    }

    [HttpPost]
    public async Task<IActionResult> RemoveCapacity(int id)
    {
        var item = await Db.SlotCapacities.FindAsync(id);
        if (item is not null)
        {
            Db.SlotCapacities.Remove(item);
            await Db.SaveChangesAsync();
            Flash("Capacity override removed — the default applies again.");
        }

        return RedirectToAction(nameof(Schedule));
    }

    [HttpPost]
    public async Task<IActionResult> ReadNotifications(string? returnUrl = null)
    {
        await _notifications.MarkAllReadAsync(CurrentUserId);
        return Redirect(Url.IsLocalUrl(returnUrl) ? returnUrl! : Url.Action(nameof(Index))!);
    }

    private async Task<ScheduleSettingsViewModel> BuildScheduleViewModelAsync() => new()
    {
        BlockedDates = await Db.BlockedDates
            .Where(b => b.Date >= DateTime.Today.AddDays(-30))
            .OrderBy(b => b.Date)
            .ToListAsync(),
        CapacityOverrides = await Db.SlotCapacities
            .Where(c => c.Date >= DateTime.Today.AddDays(-7))
            .OrderBy(c => c.Date).ThenBy(c => c.SlotStart)
            .ToListAsync(),
        SlotStarts = _scheduling.GetSlotStarts().ToList(),
        Options = _opt,
        NewCapacityValue = _opt.DefaultSlotCapacity
    };
}
