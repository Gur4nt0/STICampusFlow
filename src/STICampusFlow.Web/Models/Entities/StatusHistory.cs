using System.ComponentModel.DataAnnotations;

namespace STICampusFlow.Web.Models.Entities;

/// <summary>
/// Audit trail. Every status change writes a row here, which is what the student's
/// timeline and the registrar's activity log both read from.
/// </summary>
public class StatusHistory
{
    public int Id { get; set; }

    public int DocumentRequestId { get; set; }
    public DocumentRequest DocumentRequest { get; set; } = null!;

    public RequestStatus? FromStatus { get; set; }
    public RequestStatus ToStatus { get; set; }

    /// <summary>Null when the system performed the change (e.g. automatic no-show marking).</summary>
    public int? ChangedByUserId { get; set; }
    public User? ChangedBy { get; set; }

    [MaxLength(400)]
    public string? Note { get; set; }

    public DateTime ChangedAt { get; set; } = DateTime.Now;
}
