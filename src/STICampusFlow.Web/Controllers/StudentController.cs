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

[Authorize(Policy = "StudentOnly")]
public class StudentController : BaseController
{
    private readonly ISchedulingService _scheduling;
    private readonly IRequestService _requests;
    private readonly INotificationService _notifications;
    private readonly RegistrarOptions _opt;

    private static readonly string[] PurposeOptions =
    {
        "Board examination application",
        "Transfer to another school",
        "Scholarship application",
        "Employment requirement",
        "Visa / embassy requirement",
        "On-the-job training requirement",
        "Graduate school application",
        "Personal copy"
    };

    public StudentController(AppDbContext db, ISchedulingService scheduling, IRequestService requests,
        INotificationService notifications, IOptions<RegistrarOptions> options) : base(db)
    {
        _scheduling = scheduling;
        _requests = requests;
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

        var all = await Db.DocumentRequests
            .Include(r => r.Items).ThenInclude(i => i.DocumentType)
            .Where(r => r.StudentId == me.Id)
            .OrderByDescending(r => r.AppointmentDate)
            .ThenByDescending(r => r.SlotStart)
            .ToListAsync();

        var today = await _scheduling.GetDayAsync(DateTime.Today);

        var vm = new StudentDashboardViewModel
        {
            Student = me,
            RecentRequests = all.Take(4).ToList(),
            NextAppointment = all
                .Where(r => r.Status.IsOpen() && r.AppointmentStart >= DateTime.Today)
                .OrderBy(r => r.AppointmentStart)
                .FirstOrDefault(),
            OpenCount = all.Count(r => r.Status.IsOpen()),
            ReadyCount = all.Count(r => r.Status == RequestStatus.ReadyForPickup),
            CompletedCount = all.Count(r => r.Status == RequestStatus.Released),
            TodayClosureReason = today.IsOpen ? null : today.ClosedReason
        };

        return View(vm);
    }

    // =================================================================
    // Step 1 — choose documents
    // =================================================================

    [HttpGet]
    public async Task<IActionResult> New(string? selection = null)
    {
        var documents = await Db.DocumentTypes
            .Where(d => d.IsActive)
            .OrderBy(d => d.SortOrder)
            .ToListAsync();

        return View(new DocumentPickerViewModel
        {
            Documents = documents,
            PreselectedIds = ParseSelection(selection).Select(l => l.DocumentTypeId).ToList()
        });
    }

    // =================================================================
    // Step 2 — choose the schedule
    // =================================================================

    [HttpGet]
    public async Task<IActionResult> Book(string? selection, int? year = null, int? month = null, DateTime? date = null)
    {
        var lines = ParseSelection(selection);
        if (lines.Count == 0)
        {
            Flash("Pick at least one document first.", "warning");
            return RedirectToAction(nameof(New));
        }

        var vm = await BuildBookingViewModelAsync(selection!, lines, year, month, date);
        if (vm is null)
        {
            Flash("One of the selected documents is no longer offered.", "warning");
            return RedirectToAction(nameof(New));
        }

        return View(vm);
    }

    [HttpPost]
    public async Task<IActionResult> Book(BookingViewModel form)
    {
        var lines = ParseSelection(form.Selection);
        if (lines.Count == 0)
        {
            Flash("Pick at least one document first.", "warning");
            return RedirectToAction(nameof(New));
        }

        if (!form.AppointmentDate.HasValue)
            ModelState.AddModelError(nameof(form.AppointmentDate), "Choose an appointment date.");

        if (!TimeSpan.TryParse(form.SlotStart, out var slotStart))
            ModelState.AddModelError(nameof(form.SlotStart), "Choose a time slot.");
        else if (string.IsNullOrWhiteSpace(form.Purpose))
            ModelState.AddModelError(nameof(form.Purpose), "Tell the registrar what the document is for.");

        if (ModelState.IsValid)
        {
            var result = await _requests.CreateAsync(
                CurrentUserId,
                form.AppointmentDate!.Value,
                slotStart,
                lines,
                form.Purpose,
                form.StudentNote);

            if (result.Success)
                return RedirectToAction(nameof(Confirmation), new { id = result.Request!.Id });

            // Server-side rule failures (full slot, holiday, duplicate booking ...) land here.
            foreach (var error in result.Errors)
                ModelState.AddModelError(string.Empty, error);
        }

        // Re-render the booking screen with fresh availability so the student sees
        // the slot that filled up while they were choosing.
        var vm = await BuildBookingViewModelAsync(form.Selection, lines,
            form.AppointmentDate?.Year, form.AppointmentDate?.Month, form.AppointmentDate);

        if (vm is null) return RedirectToAction(nameof(New));

        vm.Purpose = form.Purpose;
        vm.StudentNote = form.StudentNote;
        vm.SlotStart = form.SlotStart;

        return View(vm);
    }

    // =================================================================
    // Confirmation + history
    // =================================================================

    public async Task<IActionResult> Confirmation(int id)
    {
        var request = await _requests.GetDetailAsync(id);
        if (request is null || request.StudentId != CurrentUserId) return NotFound();

        return View(request);
    }

    public async Task<IActionResult> Requests(string filter = "all")
    {
        var query = Db.DocumentRequests
            .Include(r => r.Items).ThenInclude(i => i.DocumentType)
            .Where(r => r.StudentId == CurrentUserId);

        var all = await query
            .OrderByDescending(r => r.AppointmentDate)
            .ThenByDescending(r => r.SlotStart)
            .ToListAsync();

        var filtered = filter switch
        {
            "open" => all.Where(r => r.Status.IsOpen()).ToList(),
            "closed" => all.Where(r => r.Status.IsClosed()).ToList(),
            _ => all
        };

        return View(new RequestListViewModel
        {
            Requests = filtered,
            Filter = filter,
            OpenCount = all.Count(r => r.Status.IsOpen()),
            ClosedCount = all.Count(r => r.Status.IsClosed())
        });
    }

    public async Task<IActionResult> Details(int id)
    {
        var request = await _requests.GetDetailAsync(id);
        if (request is null || request.StudentId != CurrentUserId) return NotFound();

        return View(request);
    }

    [HttpPost]
    public async Task<IActionResult> Cancel(int id)
    {
        var result = await _requests.CancelByStudentAsync(id, CurrentUserId);

        if (result.Success) Flash("Your appointment was cancelled.");
        else Flash(result.FirstError, "error");

        return RedirectToAction(nameof(Details), new { id });
    }

    /// <summary>Printable claim slip the student brings to the counter.</summary>
    public async Task<IActionResult> Slip(int id)
    {
        var request = await _requests.GetDetailAsync(id);
        if (request is null || request.StudentId != CurrentUserId) return NotFound();

        return View("~/Views/Shared/Slip.cshtml", new SlipViewModel
        {
            Request = request,
            OfficeName = _opt.OfficeName,
            CampusName = _opt.CampusName,
            IsStaffCopy = false
        });
    }

    [HttpPost]
    public async Task<IActionResult> ReadNotifications(string? returnUrl = null)
    {
        await _notifications.MarkAllReadAsync(CurrentUserId);
        return Redirect(Url.IsLocalUrl(returnUrl) ? returnUrl! : Url.Action(nameof(Index))!);
    }

    // =================================================================
    // Helpers
    // =================================================================

    /// <summary>Parses "3:2,7:1" into request lines, ignoring anything malformed.</summary>
    private static List<RequestLine> ParseSelection(string? selection)
    {
        var lines = new List<RequestLine>();
        if (string.IsNullOrWhiteSpace(selection)) return lines;

        foreach (var chunk in selection.Split(',', StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = chunk.Split(':', 2);
            if (!int.TryParse(parts[0], out var docId) || docId <= 0) continue;

            var copies = 1;
            if (parts.Length == 2 && int.TryParse(parts[1], out var parsed)) copies = parsed;

            copies = Math.Clamp(copies, 1, 20);
            lines.Add(new RequestLine(docId, copies));
        }

        return lines
            .GroupBy(l => l.DocumentTypeId)
            .Select(g => new RequestLine(g.Key, g.Sum(x => x.Copies)))
            .ToList();
    }

    private async Task<BookingViewModel?> BuildBookingViewModelAsync(string selection, List<RequestLine> lines,
        int? year, int? month, DateTime? date)
    {
        var ids = lines.Select(l => l.DocumentTypeId).ToList();
        var docs = await Db.DocumentTypes
            .Where(d => ids.Contains(d.Id) && d.IsActive)
            .ToListAsync();

        if (docs.Count != lines.Count) return null;

        var selectedDate = date?.Date;
        var calYear = year ?? selectedDate?.Year ?? DateTime.Today.Year;
        var calMonth = month ?? selectedDate?.Month ?? DateTime.Today.Month;

        // Keep the calendar inside the bookable window.
        var cursor = new DateTime(calYear, calMonth, 1);
        var floor = new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1);
        var ceiling = new DateTime(_scheduling.LatestBookableDate().Year, _scheduling.LatestBookableDate().Month, 1);
        if (cursor < floor) cursor = floor;
        if (cursor > ceiling) cursor = ceiling;

        var vm = new BookingViewModel
        {
            Selection = selection,
            Lines = lines
                .Select(l => new SelectedDocumentLine
                {
                    Document = docs.First(d => d.Id == l.DocumentTypeId),
                    Copies = l.Copies
                })
                .OrderBy(l => l.Document.SortOrder)
                .ToList(),
            CalendarYear = cursor.Year,
            CalendarMonth = cursor.Month,
            Days = (await _scheduling.GetMonthAsync(cursor.Year, cursor.Month)).ToList(),
            AppointmentDate = selectedDate,
            EarliestDate = _scheduling.EarliestBookableDate(),
            LatestDate = _scheduling.LatestBookableDate(),
            PurposeOptions = PurposeOptions.ToList()
        };

        if (selectedDate.HasValue)
            vm.Slots = (await _scheduling.GetSlotsAsync(selectedDate.Value)).ToList();

        return vm;
    }
}
