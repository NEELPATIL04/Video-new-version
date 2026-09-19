"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createTemplate, deleteTemplate, listTemplates } from "../api";
import { useAuthStore } from "@/features/auth/store";
import { ApiError } from "@/lib/api-client";

const MAX_AGENDA_ITEMS = 30;

// A reusable, user-owned preset that prefills CreateRoomForm — NOT
// room-scoped, no relation to any Room row (see schema.prisma's own
// comment on MeetingTemplate). Collapses to a chip row by default (see
// the dashboard's own card system) — the full create form (unchanged
// fields/mutations from the original always-visible version) only
// expands on "+ New", matching the same "don't show every control at
// once" restraint principle the in-call tray/menu already established.
export function TemplateManager() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [e2eeEnabled, setE2eeEnabled] = useState(false);
  const [agendaItems, setAgendaItems] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["templates", accessToken],
    queryFn: () => listTemplates(accessToken as string),
    enabled: !!accessToken,
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const trimmedItems = agendaItems.map((item) => item.trim()).filter(Boolean);
      return createTemplate(
        {
          name: name.trim(),
          e2eeEnabled,
          agendaItems: trimmedItems,
        },
        accessToken as string,
      );
    },
    onSuccess: () => {
      setName("");
      setE2eeEnabled(false);
      setAgendaItems([""]);
      setError(null);
      setExpanded(false);
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Couldn't create the template");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTemplate(id, accessToken as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });

  const updateAgendaItem = (index: number, value: string) => {
    setAgendaItems((prev) => prev.map((item, i) => (i === index ? value : item)));
  };

  const addAgendaItemRow = () => {
    setAgendaItems((prev) => (prev.length < MAX_AGENDA_ITEMS ? [...prev, ""] : prev));
  };

  const removeAgendaItemRow = (index: number) => {
    setAgendaItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const handleCreate = () => {
    if (!accessToken || !name.trim()) return;
    setError(null);
    createMutation.mutate();
  };

  if (!accessToken) return null;

  return (
    <div data-testid="template-manager" className="dash-card">
      <div className="flex items-center justify-between mb-3">
        <p className="dash-card-title">Meeting templates</p>
        {!expanded && (
          <button
            type="button"
            data-testid="template-new-toggle"
            onClick={() => setExpanded(true)}
            className="text-xs text-primary underline decoration-white/30 underline-offset-2 hover:decoration-white/60"
          >
            + New
          </button>
        )}
      </div>

      {!expanded && (
        <div data-testid="template-list" className="flex flex-wrap gap-2">
          {isLoading && <p className="text-sm text-muted">Loading templates...</p>}
          {!isLoading && (!templates || templates.length === 0) && (
            <p className="text-sm text-muted">No templates yet — create one above.</p>
          )}
          {templates?.map((template) => (
            <span key={template.id} className="dash-chip group">
              {template.name}
              <span className="text-muted text-xs">
                {template.agendaItems.length} item{template.agendaItems.length === 1 ? "" : "s"}
                {template.defaultE2eeEnabled ? " · E2EE" : ""}
              </span>
              <button
                type="button"
                data-testid={`template-delete-${template.id}`}
                onClick={() => deleteMutation.mutate(template.id)}
                disabled={deleteMutation.isPending}
                aria-label={`Delete ${template.name}`}
                className="dash-chip-remove"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {expanded && (
        <div className="flex flex-col gap-2">
          <input
            data-testid="template-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template name"
            className="dash-input w-full"
          />

          <label className="flex items-center gap-2 text-sm text-secondary">
            <input
              data-testid="template-e2ee-checkbox"
              type="checkbox"
              checked={e2eeEnabled}
              onChange={(e) => setE2eeEnabled(e.target.checked)}
            />
            Enable end-to-end encryption by default
          </label>

          <div className="flex flex-col gap-1">
            <p className="text-sm text-secondary">Starter agenda</p>
            {agendaItems.map((item, index) => (
              <div key={index} className="flex items-center gap-1">
                <input
                  data-testid={`template-agenda-item-input-${index}`}
                  value={item}
                  onChange={(e) => updateAgendaItem(index, e.target.value)}
                  placeholder={`Agenda item ${index + 1}`}
                  className="dash-input text-sm flex-1"
                />
                {agendaItems.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeAgendaItemRow(index)}
                    className="text-xs shrink-0 text-secondary"
                    aria-label={`Remove agenda item ${index + 1}`}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {agendaItems.length < MAX_AGENDA_ITEMS && (
              <button
                type="button"
                data-testid="template-add-agenda-item"
                onClick={addAgendaItemRow}
                className="text-xs text-primary underline decoration-white/30 underline-offset-2 hover:decoration-white/60 self-start"
              >
                + Add agenda item
              </button>
            )}
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              data-testid="template-submit-create"
              onClick={handleCreate}
              disabled={createMutation.isPending || !name.trim()}
              className="dash-button-primary disabled:opacity-50"
            >
              {createMutation.isPending ? "Creating..." : "Save template"}
            </button>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-xs text-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
