/* ==========================================================================
   STI CampusFlow — Microsoft SQL Server schema
   --------------------------------------------------------------------------
   The application creates this schema automatically through Entity Framework
   Core. This script is the hand-written equivalent, kept for the DBA role and
   for the Entity Relationship Diagram in Chapter 3 of the manuscript.

   Run it in SQL Server Management Studio against a fresh database when you
   want to inspect or extend the structure outside the application.
   ========================================================================== */

IF DB_ID('STICampusFlow') IS NULL
    CREATE DATABASE STICampusFlow;
GO

USE STICampusFlow;
GO

/* ---------- Drop in dependency order (safe to re-run) ---------- */
IF OBJECT_ID('dbo.Notifications', 'U')     IS NOT NULL DROP TABLE dbo.Notifications;
IF OBJECT_ID('dbo.StatusHistories', 'U')   IS NOT NULL DROP TABLE dbo.StatusHistories;
IF OBJECT_ID('dbo.RequestItems', 'U')      IS NOT NULL DROP TABLE dbo.RequestItems;
IF OBJECT_ID('dbo.DocumentRequests', 'U')  IS NOT NULL DROP TABLE dbo.DocumentRequests;
IF OBJECT_ID('dbo.SlotCapacities', 'U')    IS NOT NULL DROP TABLE dbo.SlotCapacities;
IF OBJECT_ID('dbo.BlockedDates', 'U')      IS NOT NULL DROP TABLE dbo.BlockedDates;
IF OBJECT_ID('dbo.DocumentTypes', 'U')     IS NOT NULL DROP TABLE dbo.DocumentTypes;
IF OBJECT_ID('dbo.Users', 'U')             IS NOT NULL DROP TABLE dbo.Users;
GO

/* ==========================================================================
   Users — students and registrar staff share one table, separated by Role.
   Role: 0 = Student, 1 = RegistrarStaff, 2 = RegistrarHead
   ========================================================================== */
CREATE TABLE dbo.Users
(
    Id              INT IDENTITY(1,1)   NOT NULL,
    LoginId         NVARCHAR(32)        NOT NULL,   -- 11-digit student no. or staff code
    FullName        NVARCHAR(120)       NOT NULL,
    Email           NVARCHAR(160)       NULL,
    MobileNumber    NVARCHAR(32)        NULL,
    PasswordHash    NVARCHAR(256)       NOT NULL,   -- PBKDF2-SHA256: iterations.salt.hash
    Role            INT                 NOT NULL CONSTRAINT DF_Users_Role DEFAULT (0),
    Program         NVARCHAR(80)        NULL,
    YearLevel       INT                 NULL,
    Section         NVARCHAR(40)        NULL,
    IsActive        BIT                 NOT NULL CONSTRAINT DF_Users_IsActive DEFAULT (1),
    CreatedAt       DATETIME2(7)        NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT (SYSDATETIME()),
    LastLoginAt     DATETIME2(7)        NULL,

    CONSTRAINT PK_Users PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT CK_Users_Role CHECK (Role IN (0, 1, 2)),
    CONSTRAINT CK_Users_YearLevel CHECK (YearLevel IS NULL OR YearLevel BETWEEN 1 AND 5)
);
GO

CREATE UNIQUE INDEX IX_Users_LoginId ON dbo.Users (LoginId);
GO

/* ==========================================================================
   DocumentTypes — the catalogue the registrar issues.
   Category: 0 = Records, 1 = Clearance, 2 = Certification, 3 = Enrollment
   ========================================================================== */
CREATE TABLE dbo.DocumentTypes
(
    Id              INT IDENTITY(1,1)   NOT NULL,
    Code            NVARCHAR(12)        NOT NULL,
    Name            NVARCHAR(120)       NOT NULL,
    Description     NVARCHAR(400)       NULL,
    Category        INT                 NOT NULL CONSTRAINT DF_DocumentTypes_Category DEFAULT (0),
    Fee             DECIMAL(10,2)       NOT NULL CONSTRAINT DF_DocumentTypes_Fee DEFAULT (0),
    ProcessingDays  INT                 NOT NULL CONSTRAINT DF_DocumentTypes_Days DEFAULT (3),
    MaxCopies       INT                 NOT NULL CONSTRAINT DF_DocumentTypes_MaxCopies DEFAULT (5),
    IsActive        BIT                 NOT NULL CONSTRAINT DF_DocumentTypes_IsActive DEFAULT (1),
    SortOrder       INT                 NOT NULL CONSTRAINT DF_DocumentTypes_SortOrder DEFAULT (0),

    CONSTRAINT PK_DocumentTypes PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT CK_DocumentTypes_Fee CHECK (Fee >= 0),
    CONSTRAINT CK_DocumentTypes_MaxCopies CHECK (MaxCopies BETWEEN 1 AND 20)
);
GO

CREATE UNIQUE INDEX IX_DocumentTypes_Code ON dbo.DocumentTypes (Code);
GO

/* ==========================================================================
   BlockedDates — holidays and campus closures.
   ========================================================================== */
CREATE TABLE dbo.BlockedDates
(
    Id              INT IDENTITY(1,1)   NOT NULL,
    [Date]          DATETIME2(7)        NOT NULL,
    Reason          NVARCHAR(160)       NOT NULL,
    CreatedByUserId INT                 NULL,
    CreatedAt       DATETIME2(7)        NOT NULL CONSTRAINT DF_BlockedDates_CreatedAt DEFAULT (SYSDATETIME()),

    CONSTRAINT PK_BlockedDates PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT FK_BlockedDates_Users FOREIGN KEY (CreatedByUserId)
        REFERENCES dbo.Users (Id) ON DELETE SET NULL
);
GO

CREATE UNIQUE INDEX IX_BlockedDates_Date ON dbo.BlockedDates ([Date]);
GO

/* ==========================================================================
   SlotCapacities — per-date capacity overrides.
   A NULL SlotStart applies the override to every window on that date.
   ========================================================================== */
CREATE TABLE dbo.SlotCapacities
(
    Id              INT IDENTITY(1,1)   NOT NULL,
    [Date]          DATETIME2(7)        NOT NULL,
    SlotStart       TIME(7)             NULL,
    Capacity        INT                 NOT NULL,
    CreatedByUserId INT                 NULL,
    CreatedAt       DATETIME2(7)        NOT NULL CONSTRAINT DF_SlotCapacities_CreatedAt DEFAULT (SYSDATETIME()),

    CONSTRAINT PK_SlotCapacities PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT CK_SlotCapacities_Capacity CHECK (Capacity BETWEEN 0 AND 200)
);
GO

CREATE UNIQUE INDEX IX_SlotCapacities_Date_Slot ON dbo.SlotCapacities ([Date], SlotStart);
GO

/* ==========================================================================
   DocumentRequests — one appointment, one or more documents.
   Status: 0 Pending, 1 Approved, 2 Processing, 3 ReadyForPickup,
           4 Released, 5 Rejected, 6 Cancelled, 7 NoShow
   ========================================================================== */
CREATE TABLE dbo.DocumentRequests
(
    Id                  INT IDENTITY(1,1)   NOT NULL,
    ReferenceCode       NVARCHAR(16)        NOT NULL,
    StudentId           INT                 NOT NULL,
    AppointmentDate     DATETIME2(7)        NOT NULL,
    SlotStart           TIME(7)             NOT NULL,
    SlotEnd             TIME(7)             NOT NULL,
    Status              INT                 NOT NULL CONSTRAINT DF_Requests_Status DEFAULT (0),
    Purpose             NVARCHAR(400)       NULL,
    StudentNote         NVARCHAR(600)       NULL,
    StaffNote           NVARCHAR(600)       NULL,
    RejectionReason     NVARCHAR(400)       NULL,
    TotalFee            DECIMAL(10,2)       NOT NULL CONSTRAINT DF_Requests_TotalFee DEFAULT (0),
    CreatedAt           DATETIME2(7)        NOT NULL CONSTRAINT DF_Requests_CreatedAt DEFAULT (SYSDATETIME()),
    UpdatedAt           DATETIME2(7)        NOT NULL CONSTRAINT DF_Requests_UpdatedAt DEFAULT (SYSDATETIME()),
    ProcessedByUserId   INT                 NULL,
    ApprovedAt          DATETIME2(7)        NULL,
    ReadyAt             DATETIME2(7)        NULL,
    ReleasedAt          DATETIME2(7)        NULL,

    CONSTRAINT PK_DocumentRequests PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT FK_Requests_Student FOREIGN KEY (StudentId)
        REFERENCES dbo.Users (Id),                       -- no cascade: keeps the audit trail
    CONSTRAINT FK_Requests_ProcessedBy FOREIGN KEY (ProcessedByUserId)
        REFERENCES dbo.Users (Id),
    CONSTRAINT CK_Requests_Status CHECK (Status BETWEEN 0 AND 7),
    CONSTRAINT CK_Requests_Slot CHECK (SlotEnd > SlotStart),
    CONSTRAINT CK_Requests_TotalFee CHECK (TotalFee >= 0)
);
GO

CREATE UNIQUE INDEX IX_Requests_ReferenceCode ON dbo.DocumentRequests (ReferenceCode);
CREATE INDEX IX_Requests_Date_Status ON dbo.DocumentRequests (AppointmentDate, Status);
CREATE INDEX IX_Requests_StudentId ON dbo.DocumentRequests (StudentId);
GO

/* ==========================================================================
   RequestItems — the documents inside a request.
   ========================================================================== */
CREATE TABLE dbo.RequestItems
(
    Id                  INT IDENTITY(1,1)   NOT NULL,
    DocumentRequestId   INT                 NOT NULL,
    DocumentTypeId      INT                 NOT NULL,
    Copies              INT                 NOT NULL CONSTRAINT DF_RequestItems_Copies DEFAULT (1),
    UnitFee             DECIMAL(10,2)       NOT NULL CONSTRAINT DF_RequestItems_UnitFee DEFAULT (0),

    CONSTRAINT PK_RequestItems PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT FK_RequestItems_Request FOREIGN KEY (DocumentRequestId)
        REFERENCES dbo.DocumentRequests (Id) ON DELETE CASCADE,
    CONSTRAINT FK_RequestItems_DocumentType FOREIGN KEY (DocumentTypeId)
        REFERENCES dbo.DocumentTypes (Id),
    CONSTRAINT CK_RequestItems_Copies CHECK (Copies BETWEEN 1 AND 20)
);
GO

-- The same document cannot appear twice in one request; the copy count is raised instead.
CREATE UNIQUE INDEX IX_RequestItems_Request_Document
    ON dbo.RequestItems (DocumentRequestId, DocumentTypeId);
GO

/* ==========================================================================
   StatusHistories — the audit trail behind the student tracker.
   ========================================================================== */
CREATE TABLE dbo.StatusHistories
(
    Id                  INT IDENTITY(1,1)   NOT NULL,
    DocumentRequestId   INT                 NOT NULL,
    FromStatus          INT                 NULL,      -- NULL on the first entry
    ToStatus            INT                 NOT NULL,
    ChangedByUserId     INT                 NULL,      -- NULL when the system acted
    Note                NVARCHAR(400)       NULL,
    ChangedAt           DATETIME2(7)        NOT NULL CONSTRAINT DF_StatusHistories_ChangedAt DEFAULT (SYSDATETIME()),

    CONSTRAINT PK_StatusHistories PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT FK_StatusHistories_Request FOREIGN KEY (DocumentRequestId)
        REFERENCES dbo.DocumentRequests (Id) ON DELETE CASCADE,
    CONSTRAINT FK_StatusHistories_User FOREIGN KEY (ChangedByUserId)
        REFERENCES dbo.Users (Id)
);
GO

CREATE INDEX IX_StatusHistories_Request ON dbo.StatusHistories (DocumentRequestId, ChangedAt DESC);
GO

/* ==========================================================================
   Notifications — the in-app bell menu.
   ========================================================================== */
CREATE TABLE dbo.Notifications
(
    Id          INT IDENTITY(1,1)   NOT NULL,
    UserId      INT                 NOT NULL,
    Title       NVARCHAR(140)       NOT NULL,
    Message     NVARCHAR(400)       NOT NULL,
    Link        NVARCHAR(200)       NULL,
    IsRead      BIT                 NOT NULL CONSTRAINT DF_Notifications_IsRead DEFAULT (0),
    CreatedAt   DATETIME2(7)        NOT NULL CONSTRAINT DF_Notifications_CreatedAt DEFAULT (SYSDATETIME()),

    CONSTRAINT PK_Notifications PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT FK_Notifications_User FOREIGN KEY (UserId)
        REFERENCES dbo.Users (Id) ON DELETE CASCADE
);
GO

CREATE INDEX IX_Notifications_User_Read ON dbo.Notifications (UserId, IsRead);
GO


/* ==========================================================================
   Reporting views — handy for the manuscript's Results chapter
   ========================================================================== */

-- Daily manifest: everything the counter needs for one date.
CREATE OR ALTER VIEW dbo.vw_DailyManifest
AS
SELECT
    r.AppointmentDate,
    r.SlotStart,
    r.ReferenceCode,
    u.LoginId          AS StudentNumber,
    u.FullName         AS StudentName,
    u.Program,
    r.TotalFee,
    r.Status,
    STUFF((
        SELECT ', ' + dt.Code + ' x' + CAST(ri.Copies AS NVARCHAR(10))
        FROM dbo.RequestItems ri
        JOIN dbo.DocumentTypes dt ON dt.Id = ri.DocumentTypeId
        WHERE ri.DocumentRequestId = r.Id
        FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS Documents
FROM dbo.DocumentRequests r
JOIN dbo.Users u ON u.Id = r.StudentId
WHERE r.Status <> 6;   -- exclude cancelled
GO

-- Slot utilisation: how full each window is on each date.
CREATE OR ALTER VIEW dbo.vw_SlotUtilisation
AS
SELECT
    r.AppointmentDate,
    r.SlotStart,
    COUNT(*) AS Booked
FROM dbo.DocumentRequests r
WHERE r.Status IN (0, 1, 2, 3)   -- statuses that still occupy a seat
GROUP BY r.AppointmentDate, r.SlotStart;
GO

-- Turnaround: how long the office took between submission and release.
CREATE OR ALTER VIEW dbo.vw_Turnaround
AS
SELECT
    r.ReferenceCode,
    r.CreatedAt,
    r.ReleasedAt,
    DATEDIFF(HOUR, r.CreatedAt, r.ReleasedAt) AS HoursToRelease,
    u.Program
FROM dbo.DocumentRequests r
JOIN dbo.Users u ON u.Id = r.StudentId
WHERE r.Status = 4 AND r.ReleasedAt IS NOT NULL;
GO


/* ==========================================================================
   Minimum reference data (the application seeds a fuller set on first run)
   ========================================================================== */
INSERT INTO dbo.DocumentTypes (Code, Name, Description, Category, Fee, ProcessingDays, MaxCopies, IsActive, SortOrder)
VALUES
    ('TOR',  'Transcript of Records',        'Official record of all subjects taken and grades earned.', 0, 350.00, 5, 3, 1, 1),
    ('COE',  'Certificate of Enrollment',    'Certifies that you are officially enrolled this term.',    3,  50.00, 1, 5, 1, 2),
    ('COG',  'Certificate of Grades',        'Copy of your grades for a specific term.',                 0,  75.00, 2, 5, 1, 3),
    ('GMC',  'Good Moral Certificate',       'Certifies no pending disciplinary record.',                2, 100.00, 3, 3, 1, 4),
    ('HDF',  'Honorable Dismissal',          'Clearance issued when transferring schools.',              0, 200.00, 7, 1, 1, 5),
    ('EXP',  'Examination Permit',           'Permit required to sit for examinations.',                 1,   0.00, 1, 2, 1, 6),
    ('CLR',  'Student Clearance Form',       'End-of-term clearance signed by all offices.',             1,   0.00, 2, 2, 1, 7),
    ('F137', 'Form 137 / Permanent Record',  'Permanent scholastic record.',                             0, 150.00, 7, 1, 1, 8),
    ('DIP',  'Diploma (Second Copy)',        'Replacement diploma. Requires an affidavit of loss.',      2, 500.00,10, 1, 1, 9),
    ('CAV',  'CAV (Authentication)',         'Certification, Authentication and Verification.',          2, 450.00,10, 2, 1,10);
GO

PRINT 'STI CampusFlow schema created.';
GO
