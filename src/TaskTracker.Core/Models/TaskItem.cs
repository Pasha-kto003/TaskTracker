namespace TaskTracker.Core.Models;

public sealed class TaskItem
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public string? Description { get; set; }
    public TaskStatus Status { get; set; } = TaskStatus.Todo;
    public TaskPriority Priority { get; set; } = TaskPriority.Medium;
    public DateOnly? Deadline { get; set; }
    public List<string> Tags { get; set; } = [];
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public List<StatusTransition> History { get; set; } = [];
}