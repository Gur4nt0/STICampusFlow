using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using STICampusFlow.Web.Data;
using STICampusFlow.Web.Models;
using STICampusFlow.Web.Models.Entities;
using STICampusFlow.Web.Models.ViewModels;
using STICampusFlow.Web.Services;

namespace STICampusFlow.Web.Controllers;

[AllowAnonymous]
public class AccountController : BaseController
{
    private readonly IPasswordHasher _hasher;
    private readonly ILogger<AccountController> _log;

    private static readonly string[] ProgramOptions =
    {
        "BS Information Technology",
        "BS Computer Science",
        "BS Computer Engineering",
        "BS Business Administration",
        "BS Accountancy",
        "BS Tourism Management",
        "BS Hospitality Management",
        "BS Multimedia Arts"
    };

    public AccountController(AppDbContext db, IPasswordHasher hasher, ILogger<AccountController> log) : base(db)
    {
        _hasher = hasher;
        _log = log;
    }

    // -----------------------------------------------------------------
    // Login
    // -----------------------------------------------------------------

    [HttpGet]
    public IActionResult Login(string? returnUrl = null, bool staff = false)
    {
        if (User.Identity?.IsAuthenticated == true)
            return RedirectToHome();

        return View(new LoginViewModel { ReturnUrl = returnUrl, StaffMode = staff });
    }

    [HttpPost]
    public async Task<IActionResult> Login(LoginViewModel vm)
    {
        if (!ModelState.IsValid) return View(vm);

        var loginId = vm.LoginId.Trim();
        var user = await Db.Users.FirstOrDefaultAsync(u => u.LoginId == loginId);

        // One generic message for both "no such account" and "wrong password" so the
        // form cannot be used to discover which student numbers exist.
        if (user is null || !user.IsActive || !_hasher.Verify(vm.Password, user.PasswordHash))
        {
            _log.LogWarning("Failed login attempt for {LoginId}", loginId);
            ModelState.AddModelError(string.Empty, "That ID or password is not correct.");
            return View(vm);
        }

        user.LastLoginAt = DateTime.Now;
        await Db.SaveChangesAsync();

        await SignInAsync(user, vm.RememberMe);

        if (!string.IsNullOrEmpty(vm.ReturnUrl) && Url.IsLocalUrl(vm.ReturnUrl))
            return Redirect(vm.ReturnUrl);

        return RedirectToHome(user);
    }

    // -----------------------------------------------------------------
    // Registration (students only — staff accounts are created by the head)
    // -----------------------------------------------------------------

    [HttpGet]
    public IActionResult Register()
    {
        if (User.Identity?.IsAuthenticated == true) return RedirectToHome();
        return View(new RegisterViewModel { AvailablePrograms = ProgramOptions.ToList() });
    }

    [HttpPost]
    public async Task<IActionResult> Register(RegisterViewModel vm)
    {
        vm.AvailablePrograms = ProgramOptions.ToList();

        if (!ModelState.IsValid) return View(vm);

        var studentNumber = vm.StudentNumber.Trim();

        if (await Db.Users.AnyAsync(u => u.LoginId == studentNumber))
        {
            ModelState.AddModelError(nameof(vm.StudentNumber),
                "An account already exists for that student number.");
            return View(vm);
        }

        var email = vm.Email.Trim().ToLowerInvariant();
        if (await Db.Users.AnyAsync(u => u.Email == email))
        {
            ModelState.AddModelError(nameof(vm.Email), "That e-mail address is already registered.");
            return View(vm);
        }

        var user = new User
        {
            LoginId = studentNumber,
            FullName = vm.FullName.Trim(),
            Email = email,
            MobileNumber = string.IsNullOrWhiteSpace(vm.MobileNumber) ? null : vm.MobileNumber.Trim(),
            PasswordHash = _hasher.Hash(vm.Password),
            Role = UserRole.Student,
            Program = vm.Program,
            YearLevel = vm.YearLevel,
            Section = string.IsNullOrWhiteSpace(vm.Section) ? null : vm.Section.Trim(),
            CreatedAt = DateTime.Now
        };

        Db.Users.Add(user);
        await Db.SaveChangesAsync();

        Db.Notifications.Add(new Notification
        {
            UserId = user.Id,
            Title = "Welcome to CampusFlow",
            Message = "Your account is ready. Book your first registrar appointment from the dashboard.",
            Link = "/Student"
        });
        await Db.SaveChangesAsync();

        await SignInAsync(user, false);
        Flash($"Welcome, {user.FirstName}! Your account is ready.");

        return RedirectToAction(nameof(StudentController.Index), "Student");
    }

    // -----------------------------------------------------------------
    // Logout / access denied
    // -----------------------------------------------------------------

    [HttpPost]
    [Authorize]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return RedirectToAction(nameof(Login));
    }

    [HttpGet]
    public IActionResult Denied() => View();

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------

    private async Task SignInAsync(User user, bool persist)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.FullName),
            new(ClaimTypes.Role, user.Role.ToString()),
            new("LoginId", user.LoginId),
            new("Initials", user.Initials)
        };

        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);

        await HttpContext.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(identity),
            new AuthenticationProperties
            {
                IsPersistent = persist,
                ExpiresUtc = DateTimeOffset.UtcNow.AddHours(persist ? 24 * 7 : 4)
            });
    }

    private IActionResult RedirectToHome(User? user = null)
    {
        var isStaff = user?.IsStaff
                      ?? (User.IsInRole(nameof(UserRole.RegistrarStaff)) || User.IsInRole(nameof(UserRole.RegistrarHead)));

        return isStaff
            ? RedirectToAction(nameof(RegistrarController.Index), "Registrar")
            : RedirectToAction(nameof(StudentController.Index), "Student");
    }
}
