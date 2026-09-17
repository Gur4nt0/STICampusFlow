using System.ComponentModel.DataAnnotations;

namespace STICampusFlow.Web.Models.Entities;

/// <summary>Join entity: one line per document included in a request.</summary>
public class RequestItem
{
    public int Id { get; set; }

    public int DocumentRequestId { get; set; }
    public DocumentRequest DocumentRequest { get; set; } = null!;

    public int DocumentTypeId { get; set; }
    public DocumentType DocumentType { get; set; } = null!;

    [Range(1, 20)]
    public int Copies { get; set; } = 1;

    /// <summary>Fee per copy captured at submission time.</summary>
    public decimal UnitFee { get; set; }

    public decimal LineTotal => UnitFee * Copies;
}
