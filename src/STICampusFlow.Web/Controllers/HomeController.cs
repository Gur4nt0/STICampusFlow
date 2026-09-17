using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using STICampusFlow.Web.Data;
using STICampusFlow.Web.Models;

namespace STICampusFlow.Web.Controllers;

[AllowAnonymous]
public class HomeController : BaseController
{
    public HomeController(AppDbContext db) : base(db) { }

    public IActionResult Index()
    {
        if (User.Identity?.IsAuthenticated != true)
            return RedirectToAction(nameof(AccountController.Login), "Account");

        var isStaff = User.IsInRole(nameof(UserRole.RegistrarStaff)) || User.IsInRole(nameof(UserRole.RegistrarHead));

        return isStaff
            ? RedirectToAction(nameof(RegistrarController.Index), "Registrar")
            : RedirectToAction(nameof(StudentController.Index), "Student");
    }

    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public IActionResult Error(int? code = null)
    {
        ViewBag.StatusCode = code;
        ViewBag.RequestId = HttpContext.TraceIdentifier;
        return View();
    }
}
