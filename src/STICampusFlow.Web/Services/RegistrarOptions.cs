namespace STICampusFlow.Web.Services;

/// <summary>
/// Office rules bound from the "Registrar" section of appsettings.json. Keeping these in
/// configuration means the campus can change operating hours or capacity without a rebuild.
/// </summary>
public class RegistrarOptions
{
    public const string SectionName = "Registrar";

    public string OfficeName { get; set; } = "Office of the Registrar";
    public string CampusName { get; set; } = "STI College Global City";

    /// <summary>First slot start, e.g. "08:00".</summary>
    public string OpenTime { get; set; } = "08:00";

    /// <summary>Last slot end, e.g. "17:00".</summary>
    public string CloseTime { get; set; } = "17:00";

    /// <summary>Length of one appointment window in minutes.</summary>
    public int SlotMinutes { get; set; } = 60;

    public string LunchBreakStart { get; set; } = "12:00";
    public string LunchBreakEnd { get; set; } = "13:00";

    /// <summary>How many students may book the same slot before it shows as FULL.</summary>
    public int DefaultSlotCapacity { get; set; } = 8;

    /// <summary>How far ahead students may book.</summary>
    public int MaxAdvanceBookingDays { get; set; } = 45;

    /// <summary>Same-day bookings must be at least this many hours away.</summary>
    public int MinLeadTimeHours { get; set; } = 2;

    /// <summary>Stops a student from flooding the queue with open requests.</summary>
    public int MaxOpenRequestsPerStudent { get; set; } = 3;

    public bool AutoVoidMissedAppointments { get; set; } = true;

    // --- Parsed helpers ---
    public TimeSpan Open => TimeSpan.Parse(OpenTime);
    public TimeSpan Close => TimeSpan.Parse(CloseTime);
    public TimeSpan LunchStart => TimeSpan.Parse(LunchBreakStart);
    public TimeSpan LunchEnd => TimeSpan.Parse(LunchBreakEnd);
}
