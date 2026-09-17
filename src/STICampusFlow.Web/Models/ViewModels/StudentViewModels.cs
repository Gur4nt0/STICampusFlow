using System.ComponentModel.DataAnnotations;
using STICampusFlow.Web.Models.Entities;
using STICampusFlow.Web.Services;

namespace STICampusFlow.Web.Models.ViewModels;

public class StudentDashboardViewModel
{
    public User Student { get; set; } = null!;
    public DocumentRequest? NextAppointment { get; set; }
    public List<DocumentRequest> RecentRequests { get; set; } = new();

    public int OpenCount { get; set; }
    public int ReadyCount { get; set; }
    public int CompletedCount { get; set; }

    public string? TodayClosureReason { get; set; }
}

/// <summary>Step 1 of booking — pick the documents.</summary>
public class DocumentPickerViewModel
{
    public List<DocumentType> Documents { get; set; } = new();
    public List<int> PreselectedIds { get; set; } = new();

    public IEnumerable<IGrouping<DocumentCategory, DocumentType>> Grouped =>
        Documents.OrderBy(d => d.SortOrder).GroupBy(d => d.Category);
}

/// <summary>Step 2 of booking — pick the date, the slot and confirm.</summary>
public class BookingViewModel
{
    /// <summary>"3:2,7:1" means 2 copies of doc 3 and 1 copy of doc 7.</summary>
    public string Selection { get; set; } = string.Empty;

    public List<SelectedDocumentLine> Lines { get; set; } = new();

    [Required(ErrorMessage = "Choose an appointment date.")]
    [DataType(DataType.Date)]
    public DateTime? AppointmentDate { get; set; }

    [Required(ErrorMessage = "Choose a time slot.")]
    public string? SlotStart { get; set; }

    [StringLength(400)]
    public string? Purpose { get; set; }

    [StringLength(600)]
    [Display(Name = "Note for the registrar")]
    public string? StudentNote { get; set; }

    public List<string> PurposeOptions { get; set; } = new();

    // --- Calendar data ---
    public int CalendarYear { get; set; }
    public int CalendarMonth { get; set; }
    public List<DayAvailability> Days { get; set; } = new();
    public List<SlotAvailability> Slots { get; set; } = new();

    public DateTime EarliestDate { get; set; }
    public DateTime LatestDate { get; set; }

    public decimal TotalFee => Lines.Sum(l => l.Document.Fee * l.Copies);
    public int LongestProcessing => Lines.Count == 0 ? 0 : Lines.Max(l => l.Document.ProcessingDays);
    public bool AnyPaid => Lines.Any(l => l.Document.Fee > 0);
}

public class SelectedDocumentLine
{
    public DocumentType Document { get; set; } = null!;
    public int Copies { get; set; } = 1;
    public decimal LineTotal => Document.Fee * Copies;
}

public class RequestListViewModel
{
    public List<DocumentRequest> Requests { get; set; } = new();
    public string Filter { get; set; } = "all";
    public int OpenCount { get; set; }
    public int ClosedCount { get; set; }
}

/// <summary>Drives the Pending → Approved → Ready → Released tracker.</summary>
public class TrackerStep
{
    public string Label { get; set; } = string.Empty;
    public string Caption { get; set; } = string.Empty;
    public bool IsDone { get; set; }
    public bool IsCurrent { get; set; }
    public DateTime? At { get; set; }
}
