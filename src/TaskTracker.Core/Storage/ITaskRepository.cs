using TaskTracker.Core.Models;

namespace TaskTracker.Core;

public interface ITaskRepository
{
    Task<IReadOnlyList<TaskItem>> GetAllAsync();
    Task<TaskItem?> GetAsync(int id);
    Task<TaskItem> AddAsync(TaskItem task);
    Task RemoveAsync(int id);
    Task SaveAllAsync();
}