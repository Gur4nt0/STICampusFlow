using System.ComponentModel.DataAnnotations;

namespace STICampusFlow.Web.Models.Entities;

/// <summary>
/// A calendar date the office is closed (holiday, inventory day, campus event).
/// The booking calendar greys these out and the server refuses bookings on them.
/// </summary>
public class BlockedDate
{
    public int Id { get; set; }

    public DateTime Date { get; set; }

    [Required, MaxLength(160)]
    public string Reason { get; set; } = string.Empty;

    public int? CreatedByUserId { get; set; }
    public User? CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.Now;
}
