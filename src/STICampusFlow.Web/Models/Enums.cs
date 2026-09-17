namespace STICampusFlow.Web.Models;

/// <summary>Who the account belongs to. Drives authorization policies and which portal loads after login.</summary>
public enum UserRole
{
    Student = 0,
    RegistrarStaff = 1,
    RegistrarHead = 2
}

/// <summary>
/// Lifecycle of a document request. The order matters: <see cref="RequestStatus"/> values are
/// compared numerically by the status tracker on the student dashboard.
/// </summary>
public enum RequestStatus
{
    Pending = 0,          // Submitted by the student, waiting for the registrar to review
    Approved = 1,         // Registrar accepted the request; the appointment slot is confirmed
    Processing = 2,       // Document is being prepared
    ReadyForPickup = 3,   // Document is printed/signed and waiting at the counter
    Released = 4,         // Student claimed the document
    Rejected = 5,         // Registrar declined (reason is recorded)
    Cancelled = 6,        // Student cancelled before the appointment
    NoShow = 7            // Student never showed up on the appointment date
}

/// <summary>Grouping used on the document picker screen.</summary>
public enum DocumentCategory
{
    Records = 0,
    Clearance = 1,
    Certification = 2,
    Enrollment = 3
}

public static class RequestStatusExtensions
{
    public static string ToDisplayName(this RequestStatus status) => status switch
    {
        RequestStatus.Pending => "Pending review",
        RequestStatus.Approved => "Approved",
        RequestStatus.Processing => "Processing",
        RequestStatus.ReadyForPickup => "Ready for pickup",
        RequestStatus.Released => "Released",
        RequestStatus.Rejected => "Rejected",
        RequestStatus.Cancelled => "Cancelled",
        RequestStatus.NoShow => "No show",
        _ => status.ToString()
    };

    /// <summary>CSS modifier used by the status pills in the views.</summary>
    public static string ToCssClass(this RequestStatus status) => status switch
    {
        RequestStatus.Pending => "is-pending",
        RequestStatus.Approved => "is-approved",
        RequestStatus.Processing => "is-processing",
        RequestStatus.ReadyForPickup => "is-ready",
        RequestStatus.Released => "is-released",
        RequestStatus.Rejected => "is-rejected",
        RequestStatus.Cancelled => "is-cancelled",
        RequestStatus.NoShow => "is-cancelled",
        _ => "is-pending"
    };

    /// <summary>True when the request is still moving through the office.</summary>
    public static bool IsOpen(this RequestStatus status) =>
        status is RequestStatus.Pending or RequestStatus.Approved
            or RequestStatus.Processing or RequestStatus.ReadyForPickup;

    /// <summary>True when the request reached a final state and can no longer change.</summary>
    public static bool IsClosed(this RequestStatus status) => !status.IsOpen();

    /// <summary>
    /// The transitions the registrar is allowed to perform. Anything outside this map is
    /// rejected by <c>RequestService</c> so the queue can never end up in an impossible state.
    /// </summary>
    public static RequestStatus[] AllowedNextStatuses(this RequestStatus status) => status switch
    {
        RequestStatus.Pending => new[] { RequestStatus.Approved, RequestStatus.Rejected },
        RequestStatus.Approved => new[] { RequestStatus.Processing, RequestStatus.ReadyForPickup, RequestStatus.NoShow, RequestStatus.Rejected },
        RequestStatus.Processing => new[] { RequestStatus.ReadyForPickup, RequestStatus.NoShow },
        RequestStatus.ReadyForPickup => new[] { RequestStatus.Released, RequestStatus.NoShow },
        _ => Array.Empty<RequestStatus>()
    };
}
