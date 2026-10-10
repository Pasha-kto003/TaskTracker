namespace TaskTracker.Core.Models;

public sealed record StatusTransition(TaskStatus From, TaskStatus To, DateTimeOffset At);