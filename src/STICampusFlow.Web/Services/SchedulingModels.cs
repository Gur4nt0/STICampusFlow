namespace STICampusFlow.Web.Services;

/// <summary>One appointment window on a given date, with its live remaining capacity.</summary>
public class SlotAvailability
{
    public TimeSpan Start { get; set; }
    public TimeSpan End { get; set; }
    public int Capacity { get; set; }
    public int Booked { get; set; }

    /// <summary>False when the slot is full, already past, or inside the lunch break.</summary>
    public bool IsSelectable { get; set; }

    /// <summary>Why the slot cannot be picked — surfaced as the button tooltip.</summary>
    public string? BlockedReason { get; set; }

    public int Remaining => Math.Max(0, Capacity - Booked);

    public string Label => $"{DateTime.Today.Add(Start):h:mm tt}";

    public string RangeLabel =>
        $"{DateTime.Today.Add(Start):h:mm tt} – {DateTime.Today.Add(End):h:mm tt}";

    /// <summary>Value posted back by the booking form.</summary>
    public string Value => $"{Start:hh\\:mm}";
}

/// <summary>Whole-day summary used to paint the calendar grid.</summary>
public class DayAvailability
{
    public DateTime Date { get; set; }

    /// <summary>False for weekends, holidays, past dates and dates beyond the booking horizon.</summary>
    public bool IsOpen { get; set; }

    public string? ClosedReason { get; set; }

    public int TotalCapacity { get; set; }
    public int TotalBooked { get; set; }

    public int Remaining => Math.Max(0, TotalCapacity - TotalBooked);

    /// <summary>Open but nothing left to book.</summary>
    public bool IsFull => IsOpen && Remaining == 0;

    /// <summary>Drives the "limited slots" amber styling on the calendar.</summary>
    public bool IsAlmostFull => IsOpen && !IsFull && TotalCapacity > 0 && Remaining <= TotalCapacity * 0.2;

    public bool IsSelectable => IsOpen && !IsFull;
}

/// <summary>Result of the server-side booking rule check.</summary>
public class BookingValidation
{
    public bool IsValid => Errors.Count == 0;
    public List<string> Errors { get; } = new();

    public void Add(string error) => Errors.Add(error);

    public string FirstError => Errors.FirstOrDefault() ?? "The request could not be validated.";
}
