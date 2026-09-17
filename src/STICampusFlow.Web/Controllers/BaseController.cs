using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;
using STICampusFlow.Web.Data;
using STICampusFlow.Web.Models.Entities;

namespace STICampusFlow.Web.Controllers;

/// <summary>
/// Shared plumbing: resolves the signed-in <see cref="User"/> once per request and exposes
/// the flash-message helpers the views read from TempData.
/// </summary>
public abstract class BaseController : Controller
{
    protected readonly AppDbContext Db;

    protected BaseController(AppDbContext db) => Db = db;

    protected int CurrentUserId =>
        int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : 0;

    private User? _currentUser;

    protected async Task<User?> GetCurrentUserAsync()
    {
        if (_currentUser is not null) return _currentUser;
        if (CurrentUserId == 0) return null;

        _currentUser = await Db.Users.FirstOrDefaultAsync(u => u.Id == CurrentUserId && u.IsActive);
        return _currentUser;
    }

    public override async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        // Makes the current user available to _Layout without every action having to pass it.
        var user = await GetCurrentUserAsync();
        if (user is not null)
        {
            ViewBag.CurrentUser = user;

            ViewBag.Notifications = await Db.Notifications
                .Where(n => n.UserId == user.Id)
                .OrderByDescending(n => n.CreatedAt)
                .Take(8)
                .ToListAsync();

            ViewBag.UnreadNotifications = await Db.Notifications
                .CountAsync(n => n.UserId == user.Id && !n.IsRead);
        }

        await next();
    }

    protected void Flash(string message, string type = "success")
    {
        TempData["FlashMessage"] = message;
        TempData["FlashType"] = type;
    }
}
