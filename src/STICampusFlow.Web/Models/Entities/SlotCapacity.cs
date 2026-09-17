namespace STICampusFlow.Web.Models.Entities;

/// <summary>
/// Overrides the default per-slot capacity for one specific date and time.
/// Used when the office is short-staffed or opens extra windows during enrolment week.
/// A row with <see cref="SlotStart"/> = null applies to every slot on that date.
/// </summary>
public class SlotCapacity
{
    public int Id { get; set; }

    public DateTime Date { get; set; }

    /// <summary>Null means "all slots on this date".</summary>
    public TimeSpan? SlotStart { get; set; }

    public int Capacity { get; set; }

    public int? CreatedByUserId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.Now;
}
