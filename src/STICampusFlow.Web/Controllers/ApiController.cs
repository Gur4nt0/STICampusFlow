using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using STICampusFlow.Web.Data;
using STICampusFlow.Web.Services;

namespace STICampusFlow.Web.Controllers;

/// <summary>
/// Small JSON endpoints used by the booking calendar so picking a date refreshes the
/// time slots without a full page reload. Everything returned here is also re-validated
/// on the server when the form is finally posted.
/// </summary>
[Authorize]
[Route("api")]
public class ApiController : BaseController
{
    private readonly ISchedulingService _scheduling;

    public ApiController(AppDbContext db, ISchedulingService scheduling) : base(db)
    {
        _scheduling = scheduling;
    }

    [HttpGet("availability/{year:int}/{month:int}")]
    public async Task<IActionResult> Month(int year, int month)
    {
        if (year < 2000 || year > 2100 || month < 1 || month > 12)
            return BadRequest(new { error = "Invalid month." });

        var days = await _scheduling.GetMonthAsync(year, month);

        return Json(new
        {
            year,
            month,
            days = days.Select(d => new
            {
                date = d.Date.ToString("yyyy-MM-dd"),
                day = d.Date.Day,
                isOpen = d.IsOpen,
                isFull = d.IsFull,
                isAlmostFull = d.IsAlmostFull,
                selectable = d.IsSelectable,
                remaining = d.Remaining,
                capacity = d.TotalCapacity,
                reason = d.ClosedReason
            })
        });
    }

    [HttpGet("slots")]
    public async Task<IActionResult> Slots([FromQuery] string date)
    {
        if (!DateTime.TryParse(date, out var parsed))
            return BadRequest(new { error = "Invalid date." });

        var slots = await _scheduling.GetSlotsAsync(parsed.Date);

        return Json(new
        {
            date = parsed.ToString("yyyy-MM-dd"),
            label = parsed.ToString("dddd, MMMM d, yyyy"),
            slots = slots.Select(s => new
            {
                value = s.Value,
                label = s.Label,
                range = s.RangeLabel,
                remaining = s.Remaining,
                capacity = s.Capacity,
                selectable = s.IsSelectable,
                reason = s.BlockedReason
            })
        });
    }
}
