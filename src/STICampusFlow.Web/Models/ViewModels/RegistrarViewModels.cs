using STICampusFlow.Web.Models.Entities;
using STICampusFlow.Web.Services;

namespace STICampusFlow.Web.Models.ViewModels;

public class RegistrarDashboardViewModel
{
    public User Staff { get; set; } = null!;

    public int PendingCount { get; set; }
    public int TodayCount { get; set; }
    public int ReadyCount { get; set; }
    public int ReleasedThisWeek { get; set; }
    public decimal FeesCollectedThisMonth { get; set; }

    public List<DocumentRequest> TodayManifest { get; set; } = new();
    public List<DocumentRequest> OldestPending { get; set; } = new();
    public List<StatusHistory> RecentActivity { get; set; } = new();

    /// <summary>Document code → number of live requests, for the small bar chart.</summary>
    public List<(string Code, string Name, int Count)> TopDocuments { get; set; } = new();

    public List<SlotAvailability> TodaySlots { get; set; } = new();
}

public class RegistrarQueueViewModel
{
    public List<DocumentRequest> Requests { get; set; } = new();

    // --- Filters (round-tripped through the query string) ---
    public string? Search { get; set; }
    public string Status { get; set; } = "open";
    public DateTime? FromDate { get; set; }
    public DateTime? ToDate { get; set; }
    public int? DocumentTypeId { get; set; }
    public string Sort { get; set; } = "date";

    public List<DocumentType> DocumentTypes { get; set; } = new();

    // --- Paging ---
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
    public int TotalCount { get; set; }
    public int TotalPages => PageSize == 0 ? 1 : (int)Math.Ceiling(TotalCount / (double)PageSize);
    public bool HasPrevious => Page > 1;
    public bool HasNext => Page < TotalPages;

    public int CountAll { get; set; }
    public int CountPending { get; set; }
    public int CountReady { get; set; }
}

public class ManifestViewModel
{
    public DateTime Date { get; set; }
    public List<IGrouping<TimeSpan, DocumentRequest>> BySlot { get; set; } = new();
    public int Total { get; set; }
    public decimal ExpectedFees { get; set; }
    public string? ClosureReason { get; set; }
    public List<SlotAvailability> Slots { get; set; } = new();
    public string OfficeName { get; set; } = string.Empty;
    public string CampusName { get; set; } = string.Empty;
}

public class ScheduleSettingsViewModel
{
    public List<BlockedDate> BlockedDates { get; set; } = new();
    public List<SlotCapacity> CapacityOverrides { get; set; } = new();
    public List<TimeSpan> SlotStarts { get; set; } = new();
    public RegistrarOptions Options { get; set; } = new();

    // --- Form fields ---
    public DateTime? NewBlockedDate { get; set; }
    public string? NewBlockedReason { get; set; }
    public DateTime? NewCapacityDate { get; set; }
    public string? NewCapacitySlot { get; set; }
    public int NewCapacityValue { get; set; } = 8;
}

public class SlipViewModel
{
    public DocumentRequest Request { get; set; } = null!;
    public string OfficeName { get; set; } = string.Empty;
    public string CampusName { get; set; } = string.Empty;
    public bool IsStaffCopy { get; set; }
}
