using Microsoft.EntityFrameworkCore;
using STICampusFlow.Web.Data;
using STICampusFlow.Web.Models.Entities;

namespace STICampusFlow.Web.Services;

public interface INotificationService
{
    Task PushAsync(int userId, string title, string message, string? link = null, CancellationToken ct = default);
    Task<List<Notification>> RecentAsync(int userId, int take = 8, CancellationToken ct = default);
    Task<int> UnreadCountAsync(int userId, CancellationToken ct = default);
    Task MarkAllReadAsync(int userId, CancellationToken ct = default);
}

/// <summary>
/// Writes in-app notifications. Kept behind an interface so the team can swap in
/// an SMS or e-mail sender later without touching the controllers.
/// </summary>
public class NotificationService : INotificationService
{
    private readonly AppDbContext _db;

    public NotificationService(AppDbContext db) => _db = db;

    public async Task PushAsync(int userId, string title, string message, string? link = null,
        CancellationToken ct = default)
    {
        _db.Notifications.Add(new Notification
        {
            UserId = userId,
            Title = title,
            Message = message,
            Link = link,
            CreatedAt = DateTime.Now
        });

        await _db.SaveChangesAsync(ct);
    }

    public Task<List<Notification>> RecentAsync(int userId, int take = 8, CancellationToken ct = default) =>
        _db.Notifications
            .Where(n => n.UserId == userId)
            .OrderByDescending(n => n.CreatedAt)
            .Take(take)
            .ToListAsync(ct);

    public Task<int> UnreadCountAsync(int userId, CancellationToken ct = default) =>
        _db.Notifications.CountAsync(n => n.UserId == userId && !n.IsRead, ct);

    public async Task MarkAllReadAsync(int userId, CancellationToken ct = default)
    {
        var unread = await _db.Notifications
            .Where(n => n.UserId == userId && !n.IsRead)
            .ToListAsync(ct);

        foreach (var n in unread) n.IsRead = true;
        await _db.SaveChangesAsync(ct);
    }
}
