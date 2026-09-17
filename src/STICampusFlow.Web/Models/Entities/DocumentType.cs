using System.ComponentModel.DataAnnotations;

namespace STICampusFlow.Web.Models.Entities;

/// <summary>
/// A document the registrar issues (TOR, Good Moral, Exam Permit ...). Maintained by the
/// registrar head so the catalogue can change without a code deployment.
/// </summary>
public class DocumentType
{
    public int Id { get; set; }

    /// <summary>Short code printed on the claim slip, e.g. TOR, COE, GMC.</summary>
    [Required, MaxLength(12)]
    public string Code { get; set; } = string.Empty;

    [Required, MaxLength(120)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(400)]
    public string? Description { get; set; }

    public DocumentCategory Category { get; set; } = DocumentCategory.Records;

    /// <summary>Fee per copy in PHP. 0 means free of charge.</summary>
    public decimal Fee { get; set; }

    /// <summary>Working days the office needs before the document can be claimed.</summary>
    public int ProcessingDays { get; set; } = 3;

    /// <summary>When true the student must settle the fee at the Cashier before the appointment.</summary>
    public bool RequiresPayment => Fee > 0;

    /// <summary>Maximum copies a student may ask for in one request.</summary>
    public int MaxCopies { get; set; } = 5;

    public bool IsActive { get; set; } = true;

    /// <summary>Controls the order of the cards on the document picker.</summary>
    public int SortOrder { get; set; }

    public ICollection<RequestItem> RequestItems { get; set; } = new List<RequestItem>();
}
