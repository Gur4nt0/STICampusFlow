using System.ComponentModel.DataAnnotations;

namespace STICampusFlow.Web.Models.ViewModels;

public class LoginViewModel
{
    [Required(ErrorMessage = "Enter your student number or staff ID.")]
    [Display(Name = "Student number / Staff ID")]
    public string LoginId { get; set; } = string.Empty;

    [Required(ErrorMessage = "Enter your password.")]
    [DataType(DataType.Password)]
    public string Password { get; set; } = string.Empty;

    public bool RememberMe { get; set; }

    public string? ReturnUrl { get; set; }

    /// <summary>Pre-selects the staff tab on the login card.</summary>
    public bool StaffMode { get; set; }
}

public class RegisterViewModel
{
    [Required(ErrorMessage = "Your student number is required.")]
    [RegularExpression(@"^\d{11}$", ErrorMessage = "The student number must be exactly 11 digits.")]
    [Display(Name = "Student number")]
    public string StudentNumber { get; set; } = string.Empty;

    [Required(ErrorMessage = "Your full name is required.")]
    [StringLength(120, MinimumLength = 3)]
    [Display(Name = "Full name")]
    public string FullName { get; set; } = string.Empty;

    [Required(ErrorMessage = "Your school e-mail is required.")]
    [EmailAddress(ErrorMessage = "Enter a valid e-mail address.")]
    [Display(Name = "School e-mail")]
    public string Email { get; set; } = string.Empty;

    [RegularExpression(@"^[0-9\-\+\s]{7,20}$", ErrorMessage = "Enter a valid mobile number.")]
    [Display(Name = "Mobile number")]
    public string? MobileNumber { get; set; }

    [Required(ErrorMessage = "Select your program.")]
    public string Program { get; set; } = string.Empty;

    [Required(ErrorMessage = "Select your year level.")]
    [Range(1, 5, ErrorMessage = "Year level must be between 1 and 5.")]
    [Display(Name = "Year level")]
    public int? YearLevel { get; set; }

    [Display(Name = "Section")]
    [StringLength(40)]
    public string? Section { get; set; }

    [Required(ErrorMessage = "Choose a password.")]
    [StringLength(64, MinimumLength = 8, ErrorMessage = "Use at least 8 characters.")]
    [DataType(DataType.Password)]
    public string Password { get; set; } = string.Empty;

    [Required(ErrorMessage = "Confirm your password.")]
    [Compare(nameof(Password), ErrorMessage = "The two passwords do not match.")]
    [DataType(DataType.Password)]
    [Display(Name = "Confirm password")]
    public string ConfirmPassword { get; set; } = string.Empty;

    public List<string> AvailablePrograms { get; set; } = new();
}
