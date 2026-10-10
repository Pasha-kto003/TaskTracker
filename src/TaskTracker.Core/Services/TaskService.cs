using TaskTracker.Core.Models;

namespace TaskTracker.Core.Services;

public interface ITaskService
{
    Task<Result<TaskItem>> CreateAsync(CreateTaskCommand cmd);
    Task<Result<TaskItem>> UpdateAsync(int id, UpdateTaskCommand cmd);
    Task<Result<TaskItem>> ChangeStatusAsync(int id, Models.TaskStatus newStatus);
    Task<Result<TaskItem>> GetByIdAsync(int id);
    Task<IReadOnlyList<TaskItem>> ListAsync(TaskFilter filter);
    Task<Result<bool>> DeleteAsync(int id);
    Task<TrackerStats> GetStatsAsync();
    Task<IReadOnlyList<TagCount>> GetTagsAsync();
}

public sealed record CreateTaskCommand(string Title, string? Description, TaskPriority Priority, DateOnly? Deadline, IReadOnlyList<string> Tags);
public sealed record UpdateTaskCommand(string Title, string? Description, TaskPriority Priority, DateOnly? Deadline, IReadOnlyList<string> Tags);

public sealed class TaskService : ITaskService
{
    private readonly ITaskRepository _repo;

    public TaskService(ITaskRepository repo) => _repo = repo;

    public async Task<Result<TaskItem>> CreateAsync(CreateTaskCommand cmd)
    {
        var title = cmd.Title?.Trim() ?? "";
        if (string.IsNullOrEmpty(title))
            return Result<TaskItem>.Fail("Title is required.");
        if (title.Length > 160)
            return Result<TaskItem>.Fail("Title must be 160 characters or less.");
        if (cmd.Description?.Length > 2000)
            return Result<TaskItem>.Fail("Description must be 2000 characters or less.");

        var tags = NormalizeTags(cmd.Tags);
        var now = DateTimeOffset.UtcNow;
        var task = new TaskItem
        {
            Title = title,
            Description = cmd.Description?.Trim(),
            Priority = cmd.Priority,
            Deadline = cmd.Deadline,
            Tags = tags,
            CreatedAt = now,
            UpdatedAt = now
        };
        return Result<TaskItem>.Ok(await _repo.AddAsync(task));
    }

    public async Task<Result<TaskItem>> UpdateAsync(int id, UpdateTaskCommand cmd)
    {
        var existing = await _repo.GetAsync(id);
        if (existing is null) return Result<TaskItem>.Fail($"Task #{id} not found.");

        var title = cmd.Title?.Trim() ?? "";
        if (string.IsNullOrEmpty(title)) return Result<TaskItem>.Fail("Title is required.");
        if (title.Length > 160) return Result<TaskItem>.Fail("Title must be 160 characters or less.");
        if (cmd.Description?.Length > 2000) return Result<TaskItem>.Fail("Description must be 2000 characters or less.");

        existing.Title = title;
        existing.Description = cmd.Description?.Trim();
        existing.Priority = cmd.Priority;
        existing.Deadline = cmd.Deadline;
        existing.Tags = NormalizeTags(cmd.Tags);
        existing.UpdatedAt = DateTimeOffset.UtcNow;

        await _repo.SaveAllAsync();
        return Result<TaskItem>.Ok(existing);
    }

    public async Task<Result<TaskItem>> ChangeStatusAsync(int id, Models.TaskStatus newStatus)
    {
        var t = await _repo.GetAsync(id);
        if (t is null) return Result<TaskItem>.Fail($"Task #{id} not found.");
        if (t.Status == newStatus) return Result<TaskItem>.Ok(t);

        var transition = new StatusTransition(t.Status, newStatus, DateTimeOffset.UtcNow);
        t.History.Add(transition);
        t.Status = newStatus;
        t.UpdatedAt = transition.At;
        await _repo.SaveAllAsync();
        return Result<TaskItem>.Ok(t);
    }

    public async Task<Result<TaskItem>> GetByIdAsync(int id)
    {
        var t = await _repo.GetAsync(id);
        return t is null ? Result<TaskItem>.Fail($"Task #{id} not found.") : Result<TaskItem>.Ok(t);
    }

    public async Task<IReadOnlyList<TaskItem>> ListAsync(TaskFilter f)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var weekStart = today.AddDays(-(int)today.DayOfWeek);

        IEnumerable<TaskItem> q = await _repo.GetAllAsync();
        if (f.Status is { } s) q = q.Where(t => t.Status == s);
        if (f.Priority is { } p) q = q.Where(t => t.Priority == p);
        if (!string.IsNullOrWhiteSpace(f.Tag))
            q = q.Where(t => t.Tags.Contains(f.Tag.Trim().ToLowerInvariant()));
        if (!string.IsNullOrWhiteSpace(f.Query))
            q = q.Where(t => t.Title.Contains(f.Query, StringComparison.OrdinalIgnoreCase) ||
                             (t.Description?.Contains(f.Query, StringComparison.OrdinalIgnoreCase) ?? false));
        if (f.OverdueOnly == true)
            q = q.Where(t => t.Deadline is not null && t.Deadline < today && t.Status != Models.TaskStatus.Done);

        if (string.Equals(f.View, "today", StringComparison.OrdinalIgnoreCase))
            q = q.Where(t => (t.Deadline == today) ||
                             (t.Deadline is not null && t.Deadline < today && t.Status != Models.TaskStatus.Done));
        else if (string.Equals(f.View, "done-this-week", StringComparison.OrdinalIgnoreCase))
            q = q.Where(t => t.Status == Models.TaskStatus.Done && t.UpdatedAt >= weekStart.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));

        return q
            .OrderByDescending(t => (int)t.Priority)
            .ThenBy(t => t.Deadline ?? DateOnly.MaxValue)
            .ThenByDescending(t => t.CreatedAt)
            .ToList();
    }

    public async Task<Result<bool>> DeleteAsync(int id)
    {
        var t = await _repo.GetAsync(id);
        if (t is null) return Result<bool>.Fail($"Task #{id} not found.");
        await _repo.RemoveAsync(id);
        return Result<bool>.Ok(true);
    }

    public async Task<TrackerStats> GetStatsAsync()
    {
        var all = await _repo.GetAllAsync();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var weekStart = today.AddDays(-(int)today.DayOfWeek);
        return new TrackerStats(
            Total: all.Count,
            Todo: all.Count(t => t.Status == Models.TaskStatus.Todo),
            InProgress: all.Count(t => t.Status == Models.TaskStatus.InProgress),
            Done: all.Count(t => t.Status == Models.TaskStatus.Done),
            Overdue: all.Count(t => t.Deadline is not null && t.Deadline < today && t.Status != Models.TaskStatus.Done),
            DoneThisWeek: all.Count(t => t.Status == Models.TaskStatus.Done &&
                                         t.UpdatedAt >= weekStart.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc)));
    }

    public async Task<IReadOnlyList<TagCount>> GetTagsAsync() =>
        (await _repo.GetAllAsync())
            .SelectMany(t => t.Tags)
            .GroupBy(tag => tag)
            .Select(g => new TagCount(g.Key, g.Count()))
            .OrderByDescending(tc => tc.Count)
            .ThenBy(tc => tc.Tag)
            .ToList();

    private static List<string> NormalizeTags(IReadOnlyList<string>? tags)
    {
        if (tags is null || tags.Count == 0) return [];
        return tags
            .Select(t => t.Trim().ToLowerInvariant())
            .Where(t => t.Length > 0 && t.Length <= 40)
            .Distinct()
            .ToList();
    }
}