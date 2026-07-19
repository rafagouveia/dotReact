using Microsoft.EntityFrameworkCore;

namespace DotReact.Crud;

public sealed class WorkItemsDbContext(DbContextOptions<WorkItemsDbContext> options) : DbContext(options)
{
    public DbSet<WorkItem> WorkItems => Set<WorkItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var workItem = modelBuilder.Entity<WorkItem>();
        workItem.ToTable("WorkItems");
        workItem.HasKey(item => item.Id);
        workItem.Property(item => item.Title).IsRequired().HasMaxLength(120);
        workItem.Property(item => item.Description).HasMaxLength(1000);
        workItem.Property(item => item.Status).HasConversion<string>().HasMaxLength(32);
        workItem.Property(item => item.Priority).HasConversion<string>().HasMaxLength(16);
        workItem.HasIndex(item => item.Status);
        workItem.HasIndex(item => item.UpdatedAt);
    }
}
