using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using STICampusFlow.Web.Models;
using STICampusFlow.Web.Models.Entities;
using STICampusFlow.Web.Services;

namespace STICampusFlow.Web.Data;

/// <summary>
/// Creates the database and fills it with a realistic data set so the system looks
/// "alive" during the panel defence: 5 staff accounts, 64 students, a full document
/// catalogue, holidays, and roughly 120 requests spread across past and future dates.
/// Seeding is idempotent — it only runs when the Users table is empty.
/// </summary>
public static class DbSeeder
{
    public static async Task SeedAsync(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var sp = scope.ServiceProvider;

        var db = sp.GetRequiredService<AppDbContext>();
        var hasher = sp.GetRequiredService<IPasswordHasher>();
        var options = sp.GetRequiredService<IOptions<RegistrarOptions>>().Value;
        var config = sp.GetRequiredService<IConfiguration>();
        var logger = sp.GetRequiredService<ILoggerFactory>().CreateLogger("DbSeeder");

        await db.Database.EnsureCreatedAsync();

        if (await db.Users.AnyAsync())
        {
            logger.LogInformation("Database already contains data — skipping seed.");
            return;
        }

        if (!config.GetValue("Database:SeedDemoData", true))
        {
            logger.LogInformation("Demo seeding is disabled. Creating staff accounts only.");
            db.Users.AddRange(BuildStaff(hasher));
            db.DocumentTypes.AddRange(BuildDocumentTypes());
            await db.SaveChangesAsync();
            return;
        }

        logger.LogInformation("Seeding demo data...");

        // --- Reference data -------------------------------------------------
        var documentTypes = BuildDocumentTypes();
        db.DocumentTypes.AddRange(documentTypes);

        var staff = BuildStaff(hasher);
        db.Users.AddRange(staff);

        var students = BuildStudents(hasher);
        db.Users.AddRange(students);

        db.BlockedDates.AddRange(BuildHolidays());

        await db.SaveChangesAsync();

        // --- Capacity overrides --------------------------------------------
        // Enrolment week: the office doubles the morning capacity.
        var busyDay = NextWeekday(DateTime.Today.AddDays(7));
        db.SlotCapacities.Add(new SlotCapacity
        {
            Date = busyDay,
            SlotStart = null,
            Capacity = options.DefaultSlotCapacity * 2,
            CreatedAt = DateTime.Now
        });

        // A skeleton-crew afternoon.
        var lightDay = NextWeekday(DateTime.Today.AddDays(10));
        db.SlotCapacities.Add(new SlotCapacity
        {
            Date = lightDay,
            SlotStart = new TimeSpan(15, 0, 0),
            Capacity = 2,
            CreatedAt = DateTime.Now
        });

        await db.SaveChangesAsync();

        // --- Requests -------------------------------------------------------
        var requests = BuildRequests(students, staff, documentTypes, options);
        db.DocumentRequests.AddRange(requests);
        await db.SaveChangesAsync();

        logger.LogInformation("Seed complete: {Students} students, {Staff} staff, {Requests} requests.",
            students.Count, staff.Count, requests.Count);
    }

    // =====================================================================
    // Document catalogue
    // =====================================================================

    private static List<DocumentType> BuildDocumentTypes() => new()
    {
        new DocumentType
        {
            Code = "TOR", Name = "Transcript of Records", Category = DocumentCategory.Records,
            Description = "Official record of all subjects taken and grades earned. Required for transfers and board exams.",
            Fee = 350m, ProcessingDays = 5, MaxCopies = 3, SortOrder = 1
        },
        new DocumentType
        {
            Code = "COE", Name = "Certificate of Enrollment", Category = DocumentCategory.Enrollment,
            Description = "Certifies that you are officially enrolled for the current term.",
            Fee = 50m, ProcessingDays = 1, MaxCopies = 5, SortOrder = 2
        },
        new DocumentType
        {
            Code = "COG", Name = "Certificate of Grades", Category = DocumentCategory.Records,
            Description = "Copy of your grades for a specific term, signed by the registrar.",
            Fee = 75m, ProcessingDays = 2, MaxCopies = 5, SortOrder = 3
        },
        new DocumentType
        {
            Code = "GMC", Name = "Good Moral Certificate", Category = DocumentCategory.Certification,
            Description = "Certifies that you have no pending disciplinary record on campus.",
            Fee = 100m, ProcessingDays = 3, MaxCopies = 3, SortOrder = 4
        },
        new DocumentType
        {
            Code = "HDF", Name = "Honorable Dismissal", Category = DocumentCategory.Records,
            Description = "Clearance issued when transferring to another school.",
            Fee = 200m, ProcessingDays = 7, MaxCopies = 1, SortOrder = 5
        },
        new DocumentType
        {
            Code = "EXP", Name = "Examination Permit", Category = DocumentCategory.Clearance,
            Description = "Permit required to sit for midterm or final examinations.",
            Fee = 0m, ProcessingDays = 1, MaxCopies = 2, SortOrder = 6
        },
        new DocumentType
        {
            Code = "CLR", Name = "Student Clearance Form", Category = DocumentCategory.Clearance,
            Description = "End-of-term clearance signed by all offices before grades are released.",
            Fee = 0m, ProcessingDays = 2, MaxCopies = 2, SortOrder = 7
        },
        new DocumentType
        {
            Code = "F137", Name = "Form 137 / Permanent Record", Category = DocumentCategory.Records,
            Description = "Permanent scholastic record forwarded directly to the receiving school.",
            Fee = 150m, ProcessingDays = 7, MaxCopies = 1, SortOrder = 8
        },
        new DocumentType
        {
            Code = "DIP", Name = "Diploma (Second Copy)", Category = DocumentCategory.Certification,
            Description = "Replacement copy of your diploma. Requires an affidavit of loss.",
            Fee = 500m, ProcessingDays = 10, MaxCopies = 1, SortOrder = 9
        },
        new DocumentType
        {
            Code = "CAV", Name = "CAV (Authentication)", Category = DocumentCategory.Certification,
            Description = "Certification, Authentication and Verification for overseas applications.",
            Fee = 450m, ProcessingDays = 10, MaxCopies = 2, SortOrder = 10
        }
    };

    // =====================================================================
    // Accounts
    // =====================================================================

    private static List<User> BuildStaff(IPasswordHasher hasher)
    {
        var pw = hasher.Hash("Registrar@123");

        return new List<User>
        {
            new()
            {
                LoginId = "REG-001", FullName = "Marissa Villanueva", Role = UserRole.RegistrarHead,
                Email = "mvillanueva@sti.edu.ph", PasswordHash = pw,
                CreatedAt = DateTime.Now.AddYears(-3)
            },
            new()
            {
                LoginId = "REG-002", FullName = "Dennis Ocampo", Role = UserRole.RegistrarStaff,
                Email = "docampo@sti.edu.ph", PasswordHash = pw,
                CreatedAt = DateTime.Now.AddYears(-2)
            },
            new()
            {
                LoginId = "REG-003", FullName = "Katrina Bautista", Role = UserRole.RegistrarStaff,
                Email = "kbautista@sti.edu.ph", PasswordHash = pw,
                CreatedAt = DateTime.Now.AddYears(-1)
            }
        };
    }

    private static readonly string[] FirstNames =
    {
        "Ana", "Mark", "Jerome", "Patricia", "Kyle", "Bea", "Nathaniel", "Camille", "Rafael", "Danica",
        "Joshua", "Trisha", "Miguel", "Andrea", "Paolo", "Erika", "Vincent", "Hannah", "Lorenzo", "Kaye",
        "Christian", "Nicole", "Adrian", "Jasmine", "Emmanuel", "Aira", "Gabriel", "Marielle", "Ivan", "Sophia",
        "Rommel", "Denise", "Julius", "Kristine", "Alvin", "Angelica", "Dominic", "Rhea", "Francis", "Mariel"
    };

    private static readonly string[] LastNames =
    {
        "Cruz", "Reyes", "Santos", "Bautista", "Garcia", "Mendoza", "Torres", "Flores", "Ramos", "Aquino",
        "Delos Reyes", "Villanueva", "Castillo", "Navarro", "Gonzales", "Pascual", "Domingo", "Alvarez",
        "Salazar", "Fernandez", "Marquez", "Rivera", "Soriano", "Lim", "Tan", "Uy", "Robles", "Dizon",
        "Manalo", "Enriquez", "Gutierrez", "Velasco"
    };

    private static readonly string[] Programs =
    {
        "BS Information Technology",
        "BS Computer Science",
        "BS Computer Engineering",
        "BS Business Administration",
        "BS Accountancy",
        "BS Tourism Management",
        "BS Hospitality Management",
        "BS Multimedia Arts"
    };

    private static List<User> BuildStudents(IPasswordHasher hasher)
    {
        // Fixed seed => the same demo data on every machine, which matters when
        // the manuscript screenshots have to match what the panel sees.
        var rng = new Random(20260918);
        var pw = hasher.Hash("Student@123");
        var students = new List<User>();
        var usedIds = new HashSet<string>();

        // A pinned account so the team always has a predictable login to demo with.
        students.Add(new User
        {
            LoginId = "02000123456",
            FullName = "Juan Dela Cruz",
            Email = "jdelacruz.02000123456@sti.edu.ph",
            MobileNumber = "0917-555-0142",
            PasswordHash = pw,
            Role = UserRole.Student,
            Program = "BS Information Technology",
            YearLevel = 4,
            Section = "IT-401",
            CreatedAt = DateTime.Now.AddMonths(-14)
        });
        usedIds.Add("02000123456");

        for (var i = 0; i < 63; i++)
        {
            string loginId;
            do
            {
                loginId = "020" + rng.Next(20, 27).ToString("00") + rng.Next(0, 999999).ToString("000000");
            } while (!usedIds.Add(loginId));

            var first = FirstNames[rng.Next(FirstNames.Length)];
            var last = LastNames[rng.Next(LastNames.Length)];
            var program = Programs[rng.Next(Programs.Length)];
            var year = rng.Next(1, 5);

            students.Add(new User
            {
                LoginId = loginId,
                FullName = $"{first} {last}",
                Email = $"{first[..1].ToLowerInvariant()}{last.Replace(" ", "").ToLowerInvariant()}.{loginId}@sti.edu.ph",
                MobileNumber = $"09{rng.Next(10, 99)}-{rng.Next(100, 999)}-{rng.Next(1000, 9999)}",
                PasswordHash = pw,
                Role = UserRole.Student,
                Program = program,
                YearLevel = year,
                Section = $"{Abbrev(program)}-{year}0{rng.Next(1, 4)}",
                CreatedAt = DateTime.Now.AddDays(-rng.Next(30, 900))
            });
        }

        return students;
    }

    private static string Abbrev(string program) => program switch
    {
        "BS Information Technology" => "IT",
        "BS Computer Science" => "CS",
        "BS Computer Engineering" => "CPE",
        "BS Business Administration" => "BA",
        "BS Accountancy" => "ACT",
        "BS Tourism Management" => "TM",
        "BS Hospitality Management" => "HM",
        _ => "MMA"
    };

    // =====================================================================
    // Holidays / closures
    // =====================================================================

    private static List<BlockedDate> BuildHolidays()
    {
        var year = DateTime.Today.Year;
        var list = new List<BlockedDate>
        {
            new() { Date = new DateTime(year, 11, 1), Reason = "All Saints' Day" },
            new() { Date = new DateTime(year, 11, 30), Reason = "Bonifacio Day" },
            new() { Date = new DateTime(year, 12, 25), Reason = "Christmas Day" },
            new() { Date = new DateTime(year, 12, 30), Reason = "Rizal Day" },
            new() { Date = new DateTime(year + 1, 1, 1), Reason = "New Year's Day" }
        };

        // A campus-specific closure a few days out, so the demo always has one visible.
        var inventoryDay = NextWeekday(DateTime.Today.AddDays(12));
        if (list.All(b => b.Date != inventoryDay))
            list.Add(new BlockedDate { Date = inventoryDay, Reason = "Annual records inventory — office closed" });

        return list
            .GroupBy(b => b.Date)
            .Select(g => g.First())
            .ToList();
    }

    // =====================================================================
    // Requests
    // =====================================================================

    private static List<DocumentRequest> BuildRequests(
        List<User> students, List<User> staff, List<DocumentType> docs, RegistrarOptions options)
    {
        var rng = new Random(77415);
        var requests = new List<DocumentRequest>();
        var usedCodes = new HashSet<string>();

        // Rebuild the slot grid the same way SchedulingService does.
        var slots = new List<TimeSpan>();
        var step = TimeSpan.FromMinutes(options.SlotMinutes);
        for (var t = options.Open; t + step <= options.Close; t += step)
        {
            if (t < options.LunchEnd && t + step > options.LunchStart) continue;
            slots.Add(t);
        }

        var holidays = BuildHolidays().Select(h => h.Date).ToHashSet();

        // Track "one appointment per student per day" so the seed obeys its own rules.
        var takenPerDay = new HashSet<(int studentId, DateTime date)>();
        var slotLoad = new Dictionary<(DateTime, TimeSpan), int>();

        // ---- Historical requests (already released / rejected) ----
        for (var i = 0; i < 70; i++)
        {
            var date = RandomWorkday(rng, -60, -2, holidays);
            var student = students[rng.Next(students.Count)];
            if (!takenPerDay.Add((student.Id, date))) continue;

            var slot = PickSlot(rng, slots, date, slotLoad, options.DefaultSlotCapacity);
            if (slot is null) continue;

            var status = rng.NextDouble() switch
            {
                < 0.78 => RequestStatus.Released,
                < 0.88 => RequestStatus.Rejected,
                < 0.95 => RequestStatus.NoShow,
                _ => RequestStatus.Cancelled
            };

            requests.Add(MakeRequest(rng, student, staff, docs, date, slot.Value, step, status, usedCodes));
        }

        // ---- Today's manifest — the screen the panel will look at ----
        var today = DateTime.Today;
        if (today.DayOfWeek is not (DayOfWeek.Saturday or DayOfWeek.Sunday) && !holidays.Contains(today))
        {
            for (var i = 0; i < 9; i++)
            {
                var student = students[rng.Next(students.Count)];
                if (!takenPerDay.Add((student.Id, today))) continue;

                var slot = PickSlot(rng, slots, today, slotLoad, options.DefaultSlotCapacity);
                if (slot is null) continue;

                var status = i switch
                {
                    < 3 => RequestStatus.ReadyForPickup,
                    < 5 => RequestStatus.Processing,
                    < 7 => RequestStatus.Approved,
                    _ => RequestStatus.Pending
                };

                requests.Add(MakeRequest(rng, student, staff, docs, today, slot.Value, step, status, usedCodes));
            }
        }

        // ---- Upcoming requests, mostly pending so there is a queue to work ----
        for (var i = 0; i < 42; i++)
        {
            var date = RandomWorkday(rng, 1, options.MaxAdvanceBookingDays - 5, holidays);
            var student = students[rng.Next(students.Count)];
            if (!takenPerDay.Add((student.Id, date))) continue;

            var slot = PickSlot(rng, slots, date, slotLoad, options.DefaultSlotCapacity);
            if (slot is null) continue;

            var status = rng.NextDouble() switch
            {
                < 0.55 => RequestStatus.Pending,
                < 0.85 => RequestStatus.Approved,
                _ => RequestStatus.Processing
            };

            requests.Add(MakeRequest(rng, student, staff, docs, date, slot.Value, step, status, usedCodes));
        }

        return requests;
    }

    private static DocumentRequest MakeRequest(Random rng, User student, List<User> staff, List<DocumentType> docs,
        DateTime date, TimeSpan slot, TimeSpan step, RequestStatus status, HashSet<string> usedCodes)
    {
        string code;
        do { code = ReferenceCodeGenerator.Next(); } while (!usedCodes.Add(code));

        var created = date.AddDays(-rng.Next(1, 10)).AddHours(rng.Next(8, 18));
        if (created > DateTime.Now) created = DateTime.Now.AddHours(-rng.Next(1, 48));

        var request = new DocumentRequest
        {
            ReferenceCode = code,
            Student = student,
            AppointmentDate = date,
            SlotStart = slot,
            SlotEnd = slot + step,
            Status = status,
            Purpose = Purposes[rng.Next(Purposes.Length)],
            CreatedAt = created,
            UpdatedAt = created
        };

        // One or two documents per request.
        var picked = docs.OrderBy(_ => rng.Next()).Take(rng.NextDouble() < 0.7 ? 1 : 2).ToList();
        foreach (var doc in picked)
        {
            request.Items.Add(new RequestItem
            {
                DocumentType = doc,
                Copies = Math.Min(doc.MaxCopies, rng.Next(1, 3)),
                UnitFee = doc.Fee
            });
        }
        request.TotalFee = request.Items.Sum(i => i.UnitFee * i.Copies);

        request.History.Add(new StatusHistory
        {
            FromStatus = null,
            ToStatus = RequestStatus.Pending,
            ChangedByUserId = null,
            Note = "Request submitted by the student.",
            ChangedAt = created
        });

        if (status != RequestStatus.Pending)
        {
            var processor = staff[rng.Next(staff.Count)];
            request.ProcessedBy = processor;

            var actedAt = created.AddHours(rng.Next(2, 30));
            if (actedAt > DateTime.Now) actedAt = DateTime.Now.AddMinutes(-rng.Next(10, 600));
            request.UpdatedAt = actedAt;

            if (status == RequestStatus.Rejected)
            {
                request.RejectionReason = RejectionReasons[rng.Next(RejectionReasons.Length)];
                request.History.Add(new StatusHistory
                {
                    FromStatus = RequestStatus.Pending, ToStatus = RequestStatus.Rejected,
                    ChangedBy = processor, Note = request.RejectionReason, ChangedAt = actedAt
                });
            }
            else if (status == RequestStatus.Cancelled)
            {
                request.History.Add(new StatusHistory
                {
                    FromStatus = RequestStatus.Pending, ToStatus = RequestStatus.Cancelled,
                    Note = "Cancelled by the student.", ChangedAt = actedAt
                });
            }
            else
            {
                request.ApprovedAt = actedAt;
                request.History.Add(new StatusHistory
                {
                    FromStatus = RequestStatus.Pending, ToStatus = RequestStatus.Approved,
                    ChangedBy = processor, Note = "Requirements verified.", ChangedAt = actedAt
                });

                if (status is RequestStatus.Processing or RequestStatus.ReadyForPickup
                    or RequestStatus.Released or RequestStatus.NoShow)
                {
                    var t2 = actedAt.AddHours(rng.Next(2, 20));
                    if (t2 > DateTime.Now) t2 = DateTime.Now.AddMinutes(-rng.Next(5, 300));
                    request.History.Add(new StatusHistory
                    {
                        FromStatus = RequestStatus.Approved, ToStatus = RequestStatus.Processing,
                        ChangedBy = processor, Note = "Document is being prepared.", ChangedAt = t2
                    });

                    if (status is RequestStatus.ReadyForPickup or RequestStatus.Released or RequestStatus.NoShow)
                    {
                        var t3 = t2.AddHours(rng.Next(2, 24));
                        if (t3 > DateTime.Now) t3 = DateTime.Now.AddMinutes(-rng.Next(5, 200));
                        request.ReadyAt = t3;
                        request.History.Add(new StatusHistory
                        {
                            FromStatus = RequestStatus.Processing, ToStatus = RequestStatus.ReadyForPickup,
                            ChangedBy = processor, Note = "Signed and waiting at the counter.", ChangedAt = t3
                        });

                        if (status == RequestStatus.Released)
                        {
                            var t4 = date.AddHours(rng.Next(9, 16));
                            request.ReleasedAt = t4;
                            request.History.Add(new StatusHistory
                            {
                                FromStatus = RequestStatus.ReadyForPickup, ToStatus = RequestStatus.Released,
                                ChangedBy = processor, Note = "Claimed at the counter.", ChangedAt = t4
                            });
                        }
                        else if (status == RequestStatus.NoShow)
                        {
                            request.History.Add(new StatusHistory
                            {
                                FromStatus = RequestStatus.ReadyForPickup, ToStatus = RequestStatus.NoShow,
                                Note = "Automatically voided — the appointment date passed without a release.",
                                ChangedAt = date.AddHours(17)
                            });
                        }
                    }
                }
            }
        }

        return request;
    }

    private static readonly string[] Purposes =
    {
        "Board examination application",
        "Transfer to another school",
        "Scholarship application",
        "Employment requirement",
        "Visa / embassy requirement",
        "Personal copy",
        "On-the-job training requirement",
        "Graduate school application"
    };

    private static readonly string[] RejectionReasons =
    {
        "Outstanding balance with the Cashier. Please settle first.",
        "Incomplete requirements — affidavit of loss was not attached.",
        "Duplicate request. An identical request is already being processed.",
        "Student record is on hold pending library clearance."
    };

    // ---------------------------------------------------------------------
    // Small helpers
    // ---------------------------------------------------------------------

    private static DateTime RandomWorkday(Random rng, int minOffset, int maxOffset, HashSet<DateTime> holidays)
    {
        for (var attempt = 0; attempt < 40; attempt++)
        {
            var d = DateTime.Today.AddDays(rng.Next(minOffset, maxOffset + 1));
            if (d.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) continue;
            if (holidays.Contains(d)) continue;
            return d;
        }
        return NextWeekday(DateTime.Today.AddDays(maxOffset));
    }

    private static TimeSpan? PickSlot(Random rng, List<TimeSpan> slots, DateTime date,
        Dictionary<(DateTime, TimeSpan), int> load, int capacity)
    {
        // Leave head-room so the demo calendar still shows selectable slots.
        var softCap = Math.Max(1, capacity - 2);

        foreach (var slot in slots.OrderBy(_ => rng.Next()))
        {
            var key = (date, slot);
            load.TryGetValue(key, out var used);
            if (used >= softCap) continue;

            load[key] = used + 1;
            return slot;
        }

        return null;
    }

    private static DateTime NextWeekday(DateTime from)
    {
        var d = from.Date;
        while (d.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday)
            d = d.AddDays(1);
        return d;
    }
}
