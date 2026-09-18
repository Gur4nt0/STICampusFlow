using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using STICampusFlow.Web.Data;
using STICampusFlow.Web.Services;

var builder = WebApplication.CreateBuilder(args);

// ---------------------------------------------------------------------------
// Configuration objects
// ---------------------------------------------------------------------------
builder.Services.Configure<RegistrarOptions>(
    builder.Configuration.GetSection(RegistrarOptions.SectionName));

// ---------------------------------------------------------------------------
// Database — the provider is switchable so the same code runs on SQL Server in
// the lab and on SQLite on a laptop with no internet during the defence.
// ---------------------------------------------------------------------------
var provider = builder.Configuration["Database:Provider"] ?? "Sqlite";

builder.Services.AddDbContext<AppDbContext>(opt =>
{
    if (provider.Equals("SqlServer", StringComparison.OrdinalIgnoreCase))
    {
        opt.UseSqlServer(builder.Configuration.GetConnectionString("SqlServer"),
            sql => sql.EnableRetryOnFailure());
    }
    else
    {
        opt.UseSqlite(builder.Configuration.GetConnectionString("Sqlite"));
    }
});

// ---------------------------------------------------------------------------
// Application services
// ---------------------------------------------------------------------------
builder.Services.AddSingleton<IPasswordHasher, PasswordHasher>();
builder.Services.AddScoped<ISchedulingService, SchedulingService>();
builder.Services.AddScoped<IRequestService, RequestService>();
builder.Services.AddScoped<INotificationService, NotificationService>();

// ---------------------------------------------------------------------------
// Cookie authentication + role policies
// ---------------------------------------------------------------------------
builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.LoginPath = "/Account/Login";
        options.LogoutPath = "/Account/Logout";
        options.AccessDeniedPath = "/Account/Denied";
        options.ExpireTimeSpan = TimeSpan.FromHours(4);
        options.SlidingExpiration = true;
        options.Cookie.Name = "CampusFlow.Auth";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Lax;
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("StudentOnly", p => p.RequireRole("Student"));
    options.AddPolicy("RegistrarOnly", p => p.RequireRole("RegistrarStaff", "RegistrarHead"));
    options.AddPolicy("RegistrarHeadOnly", p => p.RequireRole("RegistrarHead"));
});

builder.Services.AddControllersWithViews(options =>
{
    // Every POST in the app is CSRF-protected by default.
    options.Filters.Add(new Microsoft.AspNetCore.Mvc.AutoValidateAntiforgeryTokenAttribute());
});

builder.Services.AddHttpContextAccessor();

var app = builder.Build();

// ---------------------------------------------------------------------------
// Create + seed the database on startup
// ---------------------------------------------------------------------------
await DbSeeder.SeedAsync(app.Services);

// Housekeeping pass: void any appointment whose date has passed.
using (var scope = app.Services.CreateScope())
{
    var requests = scope.ServiceProvider.GetRequiredService<IRequestService>();
    await requests.MarkMissedAppointmentsAsync();
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------
// Render (and most PaaS hosts) terminate HTTPS at their edge proxy and forward
// requests to the container over plain HTTP — without this, UseHttpsRedirection
// below can't tell the original request was already HTTPS and redirect-loops.
var forwardedHeadersOptions = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
};
forwardedHeadersOptions.KnownNetworks.Clear();
forwardedHeadersOptions.KnownProxies.Clear();
app.UseForwardedHeaders(forwardedHeadersOptions);

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}
else
{
    app.UseDeveloperExceptionPage();
}

app.UseStatusCodePagesWithReExecute("/Home/Error", "?code={0}");
app.UseHttpsRedirection();
app.UseStaticFiles();

app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();
