using System.ComponentModel.DataAnnotations;

namespace STICampusFlow.Web.Models.Entities;

/// <summary>
/// One appointment booked by a student. A request may cover several documents
/// (see <see cref="Items"/>) but always occupies exactly one time slot.
/// </summary>
public class DocumentRequest
{
    public int Id { get; set; }

    /// <summary>Human-friendly code printed on the claim slip, e.g. CF-2K9F4M.</summary>
    [Required, MaxLength(16)]
    public string ReferenceCode { get; set; } = string.Empty;

    public int StudentId { get; set; }
    public User Student { get; set; } = null!;

    /// <summary>Calendar date of the appointment (time component is always 00:00).</summary>
    public DateTime AppointmentDate { get; set; }

    /// <summary>Start of the booked slot, e.g. 09:00.</summary>
    public TimeSpan SlotStart { get; set; }

    /// <summary>End of the booked slot, e.g. 10:00.</summary>
    public TimeSpan SlotEnd { get; set; }

    public RequestStatus Status { get; set; } = RequestStatus.Pending;

    [MaxLength(400)]
    public string? Purpose { get; set; }

    /// <summary>Note the student typed when booking.</summary>
    [MaxLength(600)]
    public string? StudentNote { get; set; }

    /// <summary>Internal note written by the registrar; visible to staff only.</summary>
    [MaxLength(600)]
    public string? StaffNote { get; set; }

    /// <summary>Shown to the student when the request is rejected.</summary>
    [MaxLength(400)]
    public string? RejectionReason { get; set; }

    /// <summary>Copy of the total fee at submission time, so later price changes do not rewrite history.</summary>
    public decimal TotalFee { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public DateTime UpdatedAt { get; set; } = DateTime.Now;

    public int? ProcessedByUserId { get; set; }
    public User? ProcessedBy { get; set; }

    public DateTime? ApprovedAt { get; set; }
    public DateTime? ReadyAt { get; set; }
    public DateTime? ReleasedAt { get; set; }

    public ICollection<RequestItem> Items { get; set; } = new List<RequestItem>();
    public ICollection<StatusHistory> History { get; set; } = new List<StatusHistory>();

    // --- Computed helpers used by the views ---

    /// <summary>Full start moment of the appointment, used for past/future comparisons.</summary>
    public DateTime AppointmentStart => AppointmentDate.Date.Add(SlotStart);

    public string SlotLabel =>
        $"{DateTime.Today.Add(SlotStart):h:mm tt} – {DateTime.Today.Add(SlotEnd):h:mm tt}";

    public string DocumentSummary
    {
        get
        {
            if (Items.Count == 0) return "—";
            var first = Items.First().DocumentType?.Name ?? "Document";
            return Items.Count == 1 ? first : $"{first} +{Items.Count - 1} more";
        }
    }

    public int TotalCopies => Items.Sum(i => i.Copies);

    /// <summary>The student may still cancel while the office has not finished the document.</summary>
    public bool CanBeCancelledByStudent =>
        (Status is RequestStatus.Pending or RequestStatus.Approved) && AppointmentStart > DateTime.Now;
}
