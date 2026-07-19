namespace DotReact.Crud;

public sealed class WorkItemInputValidator : IWorkItemInputValidator
{
    public InputValidationResult Validate(WorkItemInput input)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(input.Title))
            errors["title"] = ["O título é obrigatório."];
        else if (input.Title.Trim().Length > 120)
            errors["title"] = ["O título deve ter no máximo 120 caracteres."];

        if (input.Description?.Trim().Length > 1000)
            errors["description"] = ["A descrição deve ter no máximo 1000 caracteres."];
        if (!Enum.IsDefined(input.Status))
            errors["status"] = ["O status informado é inválido."];
        if (!Enum.IsDefined(input.Priority))
            errors["priority"] = ["A prioridade informada é inválida."];
        return new InputValidationResult(errors);
    }
}
