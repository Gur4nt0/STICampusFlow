using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using STICampusFlow.Web.Models.Entities;

namespace STICampusFlow.Web.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<DocumentType> DocumentTypes => Set<DocumentType>();
    public DbSet<DocumentRequest> DocumentRequests => Set<DocumentRequest>();
    public DbSet<RequestItem> RequestItems => Set<RequestItem>();
    public DbSet<StatusHistory> StatusHistories => Set<StatusHistory>();
    public DbSet<BlockedDate> BlockedDates => Set<BlockedDate>();
    public DbSet<SlotCapacity> SlotCapacities => Set<SlotCapacity>();
    public DbSet<Notification> Notifications => Set<Notification>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);

        // ---------- User ----------
        b.Entity<User>(e =>
        {
            // One student number / staff code can only exist once in the whole system.
            e.HasIndex(u => u.LoginId).IsUnique();
            e.Property(u => u.Role).HasConversion<int>();
            e.Ignore(u => u.Initials);
            e.Ignore(u => u.FirstName);
            e.Ignore(u => u.IsStaff);
        });

        // ---------- DocumentType ----------
        b.Entity<DocumentType>(e =>
        {
            e.HasIndex(d => d.Code).IsUnique();
            e.Property(d => d.Category).HasConversion<int>();
            e.Property(d => d.Fee).HasColumnType("decimal(10,2)");
            e.Ignore(d => d.RequiresPayment);
        });

        // ---------- DocumentRequest ----------
        b.Entity<DocumentRequest>(e =>
        {
            e.HasIndex(r => r.ReferenceCode).IsUnique();

            // The registrar queue is filtered by date + status constantly, so index that pair.
            e.HasIndex(r => new { r.AppointmentDate, r.Status });
            e.HasIndex(r => r.StudentId);

            e.Property(r => r.Status).HasConversion<int>();
            e.Property(r => r.TotalFee).HasColumnType("decimal(10,2)");

            e.HasOne(r => r.Student)
             .WithMany(u => u.Requests)
             .HasForeignKey(r => r.StudentId)
             .OnDelete(DeleteBehavior.Restrict);

            // Keeping the request when a staff account is removed avoids losing the audit trail.
            e.HasOne(r => r.ProcessedBy)
             .WithMany()
             .HasForeignKey(r => r.ProcessedByUserId)
             .OnDelete(DeleteBehavior.SetNull);

            e.Ignore(r => r.AppointmentStart);
            e.Ignore(r => r.SlotLabel);
            e.Ignore(r => r.DocumentSummary);
            e.Ignore(r => r.TotalCopies);
            e.Ignore(r => r.CanBeCancelledByStudent);
        });

        // ---------- RequestItem ----------
        b.Entity<RequestItem>(e =>
        {
            e.Property(i => i.UnitFee).HasColumnType("decimal(10,2)");
            e.Ignore(i => i.LineTotal);

            e.HasOne(i => i.DocumentRequest)
             .WithMany(r => r.Items)
             .HasForeignKey(i => i.DocumentRequestId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(i => i.DocumentType)
             .WithMany(d => d.RequestItems)
             .HasForeignKey(i => i.DocumentTypeId)
             .OnDelete(DeleteBehavior.Restrict);

            // The same document cannot be listed twice in one request; students raise the copy count instead.
            e.HasIndex(i => new { i.DocumentRequestId, i.DocumentTypeId }).IsUnique();
        });

        // ---------- StatusHistory ----------
        b.Entity<StatusHistory>(e =>
        {
            e.Property(h => h.ToStatus).HasConversion<int>();

            e.HasOne(h => h.DocumentRequest)
             .WithMany(r => r.History)
             .HasForeignKey(h => h.DocumentRequestId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(h => h.ChangedBy)
             .WithMany()
             .HasForeignKey(h => h.ChangedByUserId)
             .OnDelete(DeleteBehavior.SetNull);
        });

        // ---------- BlockedDate ----------
        b.Entity<BlockedDate>(e =>
        {
            e.HasIndex(d => d.Date).IsUnique();
            e.HasOne(d => d.CreatedBy)
             .WithMany()
             .HasForeignKey(d => d.CreatedByUserId)
             .OnDelete(DeleteBehavior.SetNull);
        });

        // ---------- SlotCapacity ----------
        b.Entity<SlotCapacity>(e =>
        {
            e.HasIndex(s => new { s.Date, s.SlotStart }).IsUnique();
        });

        // ---------- Notification ----------
        b.Entity<Notification>(e =>
        {
            e.HasIndex(n => new { n.UserId, n.IsRead });

            e.HasOne(n => n.User)
             .WithMany(u => u.Notifications)
             .HasForeignKey(n => n.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        // -----------------------------------------------------------------
        // SQLite compatibility
        // -----------------------------------------------------------------
        // SQLite has only four storage classes (INTEGER, REAL, TEXT, BLOB), so two of
        // our CLR types need an explicit mapping. SQL Server needs neither, which is why
        // this whole block is behind a provider check.
        if (Database.IsSqlite())
        {
            // 1. decimal -> REAL. Without this EF Core warns on every query that touches
            //    a money column and comparisons fall back to text ordering.
            foreach (var property in b.Model.GetEntityTypes()
                         .SelectMany(t => t.GetProperties())
                         .Where(p => p.ClrType == typeof(decimal) || p.ClrType == typeof(decimal?)))
            {
                property.SetColumnType(null);
                property.SetProviderClrType(typeof(double));
            }

            // 2. TimeSpan -> zero-padded "HH:mm:ss" TEXT.
            //    EF Core refuses to translate ORDER BY over a TimeSpan on SQLite
            //    ("SQLite does not support expressions of type 'TimeSpan' in ORDER BY
            //    clauses"), and the appointment queue is sorted by slot everywhere.
            //    A zero-padded 24-hour string sorts lexicographically in exactly the same
            //    order as the times it represents, so ORDER BY, GROUP BY and equality all
            //    work — and the column stays readable when the DBA opens the .db file.
            var timeToText = new ValueConverter<TimeSpan, string>(
                v => v.ToString(@"hh\:mm\:ss"),
                v => TimeSpan.Parse(v));

            var nullableTimeToText = new ValueConverter<TimeSpan?, string?>(
                v => v.HasValue ? v.Value.ToString(@"hh\:mm\:ss") : null,
                v => v == null ? null : TimeSpan.Parse(v));

            foreach (var entity in b.Model.GetEntityTypes())
            {
                foreach (var property in entity.GetProperties())
                {
                    if (property.ClrType == typeof(TimeSpan))
                        property.SetValueConverter(timeToText);
                    else if (property.ClrType == typeof(TimeSpan?))
                        property.SetValueConverter(nullableTimeToText);
                }
            }
        }
    }
}
