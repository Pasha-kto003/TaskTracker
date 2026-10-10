using System.Text.Json;
using System.Text.Json.Serialization;
using TaskTracker.Core;
using TaskTracker.Core.Models;
using TaskTracker.Core.Services;
using TaskTracker.Core.Storage;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddSingleton<ITaskRepository>(sp =>
{
    var cfg = sp.GetRequiredService<IConfiguration>();
    var path = cfg.GetValue<string>("Storage:JsonPath") ?? "data/tasks.json";
    return new JsonFileTaskRepository(path);
});
builder.Services.AddSingleton<ITaskService, TaskService>();

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
    o.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.MapGet("/api/stats", async (ITaskService svc) => Results.Ok(await svc.GetStatsAsync()));
app.MapGet("/api/tags", async (ITaskService svc) => Results.Ok(await svc.GetTagsAsync()));

var api = app.MapGroup("/api/tasks");

api.MapGet("/", async (
    ITaskService svc,
    string? status,
    string? priority,
    string? tag,
    string? q,
    bool? overdue,
    string? view) =>
{
    TaskTracker.Core.Models.TaskStatus? statusFilter = null;
    if (!string.IsNullOrWhiteSpace(status))
    {
        if (!Enum.TryParse(status, ignoreCase: true, out TaskTracker.Core.Models.TaskStatus s))
            return Results.BadRequest(new { error = $"Invalid status '{status}'. Valid: todo, inProgress, done." });
        statusFilter = s;
    }

    TaskPriority? priorityFilter = null;
    if (!string.IsNullOrWhiteSpace(priority))
    {
        if (!Enum.TryParse(priority, ignoreCase: true, out TaskPriority p))
            return Results.BadRequest(new { error = $"Invalid priority '{priority}'. Valid: low, medium, high." });
        priorityFilter = p;
    }

    var filter = new TaskFilter(statusFilter, priorityFilter, tag, q, overdue, view);
    return Results.Ok(await svc.ListAsync(filter));
});

api.MapGet("/{id:int}", async (int id, ITaskService svc) =>
{
    var r = await svc.GetByIdAsync(id);
    return r.IsSuccess ? Results.Ok(r.Value) : Results.NotFound(new { error = r.Error });
});

api.MapPost("/", async (CreateTaskDto dto, ITaskService svc) =>
{
    var cmd = new CreateTaskCommand(dto.Title, dto.Description,
        dto.Priority ?? TaskPriority.Medium, dto.Deadline, dto.Tags ?? []);
    var r = await svc.CreateAsync(cmd);
    return r.IsSuccess
        ? Results.Created($"/api/tasks/{r.Value!.Id}", r.Value)
        : Results.BadRequest(new { error = r.Error });
});

api.MapPut("/{id:int}", async (int id, UpdateTaskDto dto, ITaskService svc) =>
{
    var cmd = new UpdateTaskCommand(dto.Title, dto.Description,
        dto.Priority ?? TaskPriority.Medium, dto.Deadline, dto.Tags ?? []);
    var r = await svc.UpdateAsync(id, cmd);
    return r.IsSuccess ? Results.Ok(r.Value) :
           r.Error!.EndsWith("not found.") ? Results.NotFound(new { error = r.Error }) :
           Results.BadRequest(new { error = r.Error });
});

api.MapPatch("/{id:int}/status", async (int id, ChangeStatusDto dto, ITaskService svc) =>
{
    var r = await svc.ChangeStatusAsync(id, dto.Status);
    return r.IsSuccess ? Results.Ok(r.Value) :
           r.Error!.EndsWith("not found.") ? Results.NotFound(new { error = r.Error }) :
           Results.BadRequest(new { error = r.Error });
});

api.MapDelete("/{id:int}", async (int id, ITaskService svc) =>
{
    var r = await svc.DeleteAsync(id);
    return r.IsSuccess
        ? Results.NoContent()
        : Results.NotFound(new { error = r.Error });
});

app.Run();

sealed record CreateTaskDto(string Title, string? Description, TaskPriority? Priority, DateOnly? Deadline, IReadOnlyList<string>? Tags);
sealed record UpdateTaskDto(string Title, string? Description, TaskPriority? Priority, DateOnly? Deadline, IReadOnlyList<string>? Tags);
sealed record ChangeStatusDto(TaskTracker.Core.Models.TaskStatus Status);