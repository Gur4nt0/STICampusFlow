using System.ComponentModel.DataAnnotations;

namespace STICampusFlow.Web.Models.Entities;

/// <summary>In-app message shown in the bell menu. Written whenever a request changes state.</summary>
public class Notification
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User User { get; set; } = null!;

    [Required, MaxLength(140)]
    public string Title { get; set; } = string.Empty;

    [Required, MaxLength(400)]
    public string Message { get; set; } = string.Empty;

    /// <summary>Relative URL the notification links to, e.g. /Student/Details/12.</summary>
    [MaxLength(200)]
    public string? Link { get; set; }

    public bool IsRead { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.Now;
}
