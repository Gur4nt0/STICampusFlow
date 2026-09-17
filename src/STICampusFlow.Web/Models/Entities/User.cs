using System.ComponentModel.DataAnnotations;

namespace STICampusFlow.Web.Models.Entities;

/// <summary>
/// A single account table serves both students and registrar staff. The <see cref="Role"/>
/// column decides which portal the user lands on and which controllers they may reach.
/// </summary>
public class User
{
    public int Id { get; set; }

    /// <summary>11-digit STI student number for students, or a staff code (e.g. REG-001) for staff.</summary>
    [Required, MaxLength(32)]
    public string LoginId { get; set; } = string.Empty;

    [Required, MaxLength(120)]
    public string FullName { get; set; } = string.Empty;

    [MaxLength(160)]
    public string? Email { get; set; }

    [MaxLength(32)]
    public string? MobileNumber { get; set; }

    /// <summary>PBKDF2-SHA256 hash. Never stores the plain password.</summary>
    [Required, MaxLength(256)]
    public string PasswordHash { get; set; } = string.Empty;

    public UserRole Role { get; set; } = UserRole.Student;

    // --- Student-only fields (null for staff) ---
    [MaxLength(80)]
    public string? Program { get; set; }

    public int? YearLevel { get; set; }

    [MaxLength(40)]
    public string? Section { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.Now;

    public DateTime? LastLoginAt { get; set; }

    // --- Navigation ---
    public ICollection<DocumentRequest> Requests { get; set; } = new List<DocumentRequest>();
    public ICollection<Notification> Notifications { get; set; } = new List<Notification>();

    /// <summary>Initials shown in the avatar circle, e.g. "Ana Cruz" -> "AC".</summary>
    public string Initials
    {
        get
        {
            var parts = FullName.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 0) return "?";
            if (parts.Length == 1) return parts[0][..1].ToUpperInvariant();
            return string.Concat(parts[0][..1], parts[^1][..1]).ToUpperInvariant();
        }
    }

    public string FirstName =>
        FullName.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? FullName;

    public bool IsStaff => Role is UserRole.RegistrarStaff or UserRole.RegistrarHead;
}
