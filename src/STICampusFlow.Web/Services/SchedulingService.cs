using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using STICampusFlow.Web.Data;
using STICampusFlow.Web.Models;
using STICampusFlow.Web.Models.Entities;

namespace STICampusFlow.Web.Services;

public interface ISchedulingService
{
    IReadOnlyList<TimeSpan> GetSlotStarts();
    TimeSpan GetSlotEnd(TimeSpan start);
    DateTime EarliestBookableDate();
    DateTime LatestBookableDate();

    Task<IReadOnlyList<SlotAvailability>> GetSlotsAsync(DateTime date, CancellationToken ct = default);
    Task<IReadOnlyList<DayAvailability>> GetMonthAsync(int year, int month, CancellationToken ct = default);
    Task<DayAvailability> GetDayAsync(DateTime date, CancellationToken ct = default);

    Task<BookingValidation> ValidateBookingAsync(int studentId, DateTime date, TimeSpan slotStart,
        int? excludeRequestId = null, CancellationToken ct = default);
}

/// <summary>
/// The scheduling engine. Everything the booking calendar shows and everything the
/// controller accepts is decided here, so the client-side calendar can never be used
/// to sneak in an invalid appointment.
///
/// Rules enforced, in order:
///   1. Office operating hours and slot length (configuration driven)
///   2. Lunch break is not bookable
///   3. Weekends are closed
///   4. Holidays / closure dates from the BlockedDates table
///   5. No past dates, and same-day bookings need a minimum lead time
///   6. A booking horizon (students cannot book a year ahead)
///   7. Per-slot capacity, with per-date overrides from the SlotCapacities table
///   8. One appointment per student per day
///   9. A cap on how many open requests a single student may hold
/// </summary>
public class SchedulingService : ISchedulingService
{
    private readonly AppDbContext _db;
    private readonly RegistrarOptions _opt;

    public SchedulingService(AppDbContext db, IOptions<RegistrarOptions> options)
    {
        _db = db;
        _opt = options.Value;
    }

    /// <summary>Builds the fixed grid of slot start times from the configured office hours.</summary>
    public IReadOnlyList<TimeSpan> GetSlotStarts()
    {
        var slots = new List<TimeSpan>();
        var step = TimeSpan.FromMinutes(_opt.SlotMinutes);

        for (var t = _opt.Open; t + step <= _opt.Close; t += step)
        {
            // Skip any window that overlaps the lunch break.
            var overlapsLunch = t < _opt.LunchEnd && (t + step) > _opt.LunchStart;
            if (overlapsLunch) continue;

            slots.Add(t);
        }

        return slots;
    }

    public TimeSpan GetSlotEnd(TimeSpan start) => start + TimeSpan.FromMinutes(_opt.SlotMinutes);

    public DateTime EarliestBookableDate() => DateTime.Today;

    public DateTime LatestBookableDate() => DateTime.Today.AddDays(_opt.MaxAdvanceBookingDays);

    // ---------------------------------------------------------------------
    // Availability
    // ---------------------------------------------------------------------

    public async Task<IReadOnlyList<SlotAvailability>> GetSlotsAsync(DateTime date, CancellationToken ct = default)
    {
        var day = date.Date;
        var starts = GetSlotStarts();

        // How many live requests already sit on each slot of this date.
        var bookedBySlot = await _db.DocumentRequests
            .Where(r => r.AppointmentDate == day && OccupiesSlotStatuses.Contains(r.Status))
            .GroupBy(r => r.SlotStart)
            .Select(g => new { Slot = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Slot, x => x.Count, ct);

        var overrides = await _db.SlotCapacities
            .Where(c => c.Date == day)
            .ToListAsync(ct);

        var closure = await _db.BlockedDates.FirstOrDefaultAsync(b => b.Date == day, ct);

        var result = new List<SlotAvailability>(starts.Count);

        foreach (var start in starts)
        {
            var capacity = ResolveCapacity(overrides, start);
            var booked = bookedBySlot.TryGetValue(start, out var n) ? n : 0;

            var slot = new SlotAvailability
            {
                Start = start,
                End = GetSlotEnd(start),
                Capacity = capacity,
                Booked = booked
            };

            // Work out the single most relevant reason the slot cannot be picked.
            if (closure is not null)
            {
                slot.BlockedReason = closure.Reason;
            }
            else if (day.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday)
            {
                slot.BlockedReason = "The office is closed on weekends.";
            }
            else if (day < DateTime.Today)
            {
                slot.BlockedReason = "This date has already passed.";
            }
            else if (day > LatestBookableDate())
            {
                slot.BlockedReason = $"Bookings open only {_opt.MaxAdvanceBookingDays} days ahead.";
            }
            else if (day == DateTime.Today && day.Add(start) < DateTime.Now.AddHours(_opt.MinLeadTimeHours))
            {
                slot.BlockedReason = $"Same-day slots must be at least {_opt.MinLeadTimeHours} hour(s) from now.";
            }
            else if (capacity <= 0)
            {
                slot.BlockedReason = "This window is closed.";
            }
            else if (booked >= capacity)
            {
                slot.BlockedReason = "This slot is fully booked.";
            }

            slot.IsSelectable = slot.BlockedReason is null;
            result.Add(slot);
        }

        return result;
    }

    public async Task<DayAvailability> GetDayAsync(DateTime date, CancellationToken ct = default)
    {
        var day = date.Date;
        var slots = await GetSlotsAsync(day, ct);
        var closure = await _db.BlockedDates.FirstOrDefaultAsync(b => b.Date == day, ct);
        return BuildDay(day, slots, closure?.Reason);
    }

    public async Task<IReadOnlyList<DayAvailability>> GetMonthAsync(int year, int month, CancellationToken ct = default)
    {
        var first = new DateTime(year, month, 1);
        var last = first.AddMonths(1).AddDays(-1);
        var starts = GetSlotStarts();

        // Pull the whole month in three queries instead of one query per day.
        var counts = await _db.DocumentRequests
            .Where(r => r.AppointmentDate >= first && r.AppointmentDate <= last
                        && OccupiesSlotStatuses.Contains(r.Status))
            .GroupBy(r => new { r.AppointmentDate, r.SlotStart })
            .Select(g => new { g.Key.AppointmentDate, g.Key.SlotStart, Count = g.Count() })
            .ToListAsync(ct);

        var overrides = await _db.SlotCapacities
            .Where(c => c.Date >= first && c.Date <= last)
            .ToListAsync(ct);

        var closures = await _db.BlockedDates
            .Where(b => b.Date >= first && b.Date <= last)
            .ToDictionaryAsync(b => b.Date, b => b.Reason, ct);

        var days = new List<DayAvailability>();

        for (var d = first; d <= last; d = d.AddDays(1))
        {
            var dayOverrides = overrides.Where(o => o.Date == d).ToList();
            var dayCounts = counts.Where(c => c.AppointmentDate == d).ToList();
            closures.TryGetValue(d, out var closureReason);

            var slots = starts.Select(s => new SlotAvailability
            {
                Start = s,
                End = GetSlotEnd(s),
                Capacity = ResolveCapacity(dayOverrides, s),
                Booked = dayCounts.FirstOrDefault(c => c.SlotStart == s)?.Count ?? 0,
                IsSelectable = true
            }).ToList();

            // Mirror the per-slot rules that apply at the whole-day level.
            if (d == DateTime.Today)
            {
                foreach (var slot in slots)
                {
                    if (d.Add(slot.Start) < DateTime.Now.AddHours(_opt.MinLeadTimeHours))
                        slot.IsSelectable = false;
                }
            }

            days.Add(BuildDay(d, slots, closureReason));
        }

        return days;
    }

    private DayAvailability BuildDay(DateTime date, IReadOnlyList<SlotAvailability> slots, string? closureReason)
    {
        var day = new DayAvailability { Date = date };

        if (closureReason is not null)
        {
            day.IsOpen = false;
            day.ClosedReason = closureReason;
            return day;
        }

        if (date.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday)
        {
            day.IsOpen = false;
            day.ClosedReason = "Weekend — office closed";
            return day;
        }

        if (date < DateTime.Today)
        {
            day.IsOpen = false;
            day.ClosedReason = "Date has passed";
            return day;
        }

        if (date > LatestBookableDate())
        {
            day.IsOpen = false;
            day.ClosedReason = $"Beyond the {_opt.MaxAdvanceBookingDays}-day booking window";
            return day;
        }

        day.IsOpen = true;

        // Only count windows that are genuinely open for booking on this date.
        var live = slots.Where(s => s.IsSelectable || s.Booked > 0).ToList();
        day.TotalCapacity = slots.Where(s => s.IsSelectable).Sum(s => s.Capacity);
        day.TotalBooked = live.Sum(s => Math.Min(s.Booked, s.Capacity));

        return day;
    }

    /// <summary>
    /// Per-date override beats per-slot default. A row with a null SlotStart covers the whole day.
    /// </summary>
    private int ResolveCapacity(IEnumerable<SlotCapacity> overrides, TimeSpan slotStart)
    {
        var list = overrides as ICollection<SlotCapacity> ?? overrides.ToList();

        var exact = list.FirstOrDefault(o => o.SlotStart == slotStart);
        if (exact is not null) return exact.Capacity;

        var wholeDay = list.FirstOrDefault(o => o.SlotStart == null);
        if (wholeDay is not null) return wholeDay.Capacity;

        return _opt.DefaultSlotCapacity;
    }

    // ---------------------------------------------------------------------
    // Validation
    // ---------------------------------------------------------------------

    /// <summary>Statuses that still hold a seat in a time slot.</summary>
    private static readonly RequestStatus[] OccupiesSlotStatuses =
    {
        RequestStatus.Pending,
        RequestStatus.Approved,
        RequestStatus.Processing,
        RequestStatus.ReadyForPickup
    };

    public async Task<BookingValidation> ValidateBookingAsync(int studentId, DateTime date, TimeSpan slotStart,
        int? excludeRequestId = null, CancellationToken ct = default)
    {
        var v = new BookingValidation();
        var day = date.Date;

        // --- Rule: the slot must exist in the configured grid ---
        if (!GetSlotStarts().Contains(slotStart))
        {
            v.Add($"{DateTime.Today.Add(slotStart):h:mm tt} is not an appointment window. " +
                  $"The office serves {DateTime.Today.Add(_opt.Open):h:mm tt} to {DateTime.Today.Add(_opt.Close):h:mm tt}.");
            return v;   // nothing else is meaningful once the slot is bogus
        }

        // --- Rule: weekends ---
        if (day.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday)
            v.Add("The registrar is closed on weekends. Please pick a weekday.");

        // --- Rule: holidays and campus closures ---
        var closure = await _db.BlockedDates.FirstOrDefaultAsync(b => b.Date == day, ct);
        if (closure is not null)
            v.Add($"The office is closed on {day:MMMM d, yyyy} — {closure.Reason}.");

        // --- Rule: no bookings in the past ---
        if (day < DateTime.Today)
            v.Add("You cannot book an appointment on a date that has already passed.");
        else if (day == DateTime.Today && day.Add(slotStart) < DateTime.Now.AddHours(_opt.MinLeadTimeHours))
            v.Add($"Same-day appointments must be booked at least {_opt.MinLeadTimeHours} hour(s) in advance.");

        // --- Rule: booking horizon ---
        if (day > LatestBookableDate())
            v.Add($"Appointments can only be booked up to {_opt.MaxAdvanceBookingDays} days ahead.");

        // --- Rule: slot capacity ---
        var overrides = await _db.SlotCapacities.Where(c => c.Date == day).ToListAsync(ct);
        var capacity = ResolveCapacity(overrides, slotStart);

        var bookedQuery = _db.DocumentRequests
            .Where(r => r.AppointmentDate == day
                        && r.SlotStart == slotStart
                        && OccupiesSlotStatuses.Contains(r.Status));

        if (excludeRequestId.HasValue)
            bookedQuery = bookedQuery.Where(r => r.Id != excludeRequestId.Value);

        var booked = await bookedQuery.CountAsync(ct);

        if (capacity <= 0)
            v.Add("That window is not open for appointments.");
        else if (booked >= capacity)
            v.Add($"The {DateTime.Today.Add(slotStart):h:mm tt} slot is already full ({booked}/{capacity}). Please choose another time.");

        // --- Rule: one appointment per student per day (prevents double booking) ---
        var sameDayQuery = _db.DocumentRequests
            .Where(r => r.StudentId == studentId
                        && r.AppointmentDate == day
                        && OccupiesSlotStatuses.Contains(r.Status));

        if (excludeRequestId.HasValue)
            sameDayQuery = sameDayQuery.Where(r => r.Id != excludeRequestId.Value);

        if (await sameDayQuery.AnyAsync(ct))
            v.Add($"You already have an appointment on {day:MMMM d, yyyy}. Cancel it first or pick another date.");

        // --- Rule: cap on simultaneous open requests ---
        var openQuery = _db.DocumentRequests
            .Where(r => r.StudentId == studentId && OccupiesSlotStatuses.Contains(r.Status));

        if (excludeRequestId.HasValue)
            openQuery = openQuery.Where(r => r.Id != excludeRequestId.Value);

        var openCount = await openQuery.CountAsync(ct);
        if (openCount >= _opt.MaxOpenRequestsPerStudent)
            v.Add($"You already have {openCount} active request(s). The limit is {_opt.MaxOpenRequestsPerStudent} " +
                  "— please claim or cancel one before booking again.");

        return v;
    }
}
