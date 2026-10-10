namespace TaskTracker.Core.Models;

public sealed record TaskFilter(
    TaskStatus? Status = null,
    TaskPriority? Priority = null,
    string? Tag = null,
    string? Query = null,
    bool? OverdueOnly = null,
    string? View = null  // "today" | "done-this-week" | null
);