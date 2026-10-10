namespace TaskTracker.Core.Models;

public sealed record TrackerStats(int Total, int Todo, int InProgress, int Done, int Overdue, int DoneThisWeek);

public sealed record TagCount(string Tag, int Count);