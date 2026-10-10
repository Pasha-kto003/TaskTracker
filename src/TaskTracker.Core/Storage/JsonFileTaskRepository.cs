using System.Text.Json;
using System.Text.Json.Serialization;
using TaskTracker.Core.Models;

namespace TaskTracker.Core.Storage;

public sealed class JsonFileTaskRepository : ITaskRepository
{
    private readonly string _filePath;
    private readonly string _tmpPath;
    private readonly string _bakPath;
    private readonly SemaphoreSlim _gate = new(1, 1);

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
    };

    private List<TaskItem> _cache = [];
    private int _nextId;
    private bool _loaded;

    public JsonFileTaskRepository(string filePath)
    {
        _filePath = Path.GetFullPath(filePath);
        _tmpPath = _filePath + ".tmp";
        _bakPath = _filePath + ".bak";
        Directory.CreateDirectory(Path.GetDirectoryName(_filePath)!);
    }

    private async Task EnsureLoadedAsync()
    {
        if (_loaded) return;
        if (File.Exists(_filePath))
        {
            var json = await File.ReadAllTextAsync(_filePath);
            if (!string.IsNullOrWhiteSpace(json))
                _cache = JsonSerializer.Deserialize<List<TaskItem>>(json, JsonOpts) ?? [];
        }
        _nextId = _cache.Count == 0 ? 1 : _cache.Max(t => t.Id) + 1;
        _loaded = true;
    }

    private async Task PersistAsync()
    {
        // 1) пишем во временный файл
        var json = JsonSerializer.Serialize(_cache, JsonOpts);
        await File.WriteAllTextAsync(_tmpPath, json);

        // 2) атомарный rename; .bak — страховка от первого запуска
        if (File.Exists(_filePath))
        {
            if (File.Exists(_bakPath)) File.Delete(_bakPath);
            File.Move(_filePath, _bakPath);
        }
        File.Move(_tmpPath, _filePath);
    }

    public async Task<IReadOnlyList<TaskItem>> GetAllAsync()
    {
        await _gate.WaitAsync();
        try { await EnsureLoadedAsync(); return _cache.ToList(); }
        finally { _gate.Release(); }
    }

    public async Task<TaskItem?> GetAsync(int id)
    {
        await _gate.WaitAsync();
        try { await EnsureLoadedAsync(); return _cache.FirstOrDefault(t => t.Id == id); }
        finally { _gate.Release(); }
    }

    public async Task<TaskItem> AddAsync(TaskItem task)
    {
        await _gate.WaitAsync();
        try
        {
            await EnsureLoadedAsync();
            task.Id = _nextId++;
            _cache.Add(task);
            await PersistAsync();
            return task;
        }
        finally { _gate.Release(); }
    }

    public async Task RemoveAsync(int id)
    {
        await _gate.WaitAsync();
        try
        {
            await EnsureLoadedAsync();
            _cache.RemoveAll(t => t.Id == id);
            await PersistAsync();
        }
        finally { _gate.Release(); }
    }

    public async Task SaveAllAsync()
    {
        await _gate.WaitAsync();
        try { await PersistAsync(); }
        finally { _gate.Release(); }
    }
}