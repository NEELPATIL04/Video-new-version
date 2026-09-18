"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createTemplate, deleteTemplate, listTemplates } from "../api";
import { useAuthStore } from "@/features/auth/store";
import { ApiError } from "@/lib/api-client";

const MAX_AGENDA_ITEMS = 30;

// A reusable, user-owned preset that prefills CreateRoomForm — NOT
// room-scoped, no relation to any Room row (see schema.prisma's own
// comment on MeetingTemplate). Rendered on /rooms alongside CreateRoomForm/
// RoomList, following the same react-query create/list/invalidate pattern
// CoHostControl and RoomList already use elsewhere in this feature.
export function TemplateManager() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
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
    <div
      data-testid="template-manager"
      className="flex flex-col gap-3 w-full max-w-md border rounded px-4 py-3"
    >
      <h2 className="font-medium">Meeting templates</h2>

      <div className="flex flex-col gap-2">
        <input
          data-testid="template-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Template name"
          className="border rounded px-3 py-2 w-full"
        />

        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            data-testid="template-e2ee-checkbox"
            type="checkbox"
            checked={e2eeEnabled}
            onChange={(e) => setE2eeEnabled(e.target.checked)}
          />
          Enable end-to-end encryption by default
        </label>

        <div className="flex flex-col gap-1">
          <p className="text-sm text-gray-600">Starter agenda</p>
          {agendaItems.map((item, index) => (
            <div key={index} className="flex items-center gap-1">
              <input
                data-testid={`template-agenda-item-input-${index}`}
                value={item}
                onChange={(e) => updateAgendaItem(index, e.target.value)}
                placeholder={`Agenda item ${index + 1}`}
                className="border rounded px-2 py-1 text-sm flex-1"
              />
              {agendaItems.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeAgendaItemRow(index)}
                  className="text-xs shrink-0"
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
              className="text-xs underline self-start"
            >
              + Add agenda item
            </button>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="button"
          data-testid="template-submit-create"
          onClick={handleCreate}
          disabled={createMutation.isPending || !name.trim()}
          className="bg-black text-white rounded px-4 py-2 disabled:opacity-50 self-start"
        >
          {createMutation.isPending ? "Creating..." : "Save template"}
        </button>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading templates...</p>}
      {!isLoading && (!templates || templates.length === 0) && (
        <p className="text-sm text-gray-500">No templates yet — create one above.</p>
      )}
      {templates && templates.length > 0 && (
        <ul data-testid="template-list" className="flex flex-col gap-2">
          {templates.map((template) => (
            <li
              key={template.id}
              className="border rounded px-3 py-2 flex items-center justify-between gap-2"
            >
              <div>
                <p className="text-sm font-medium">{template.name}</p>
                <p className="text-xs text-gray-500">
                  {template.agendaItems.length} agenda item
                  {template.agendaItems.length === 1 ? "" : "s"}
                  {template.defaultE2eeEnabled ? " · E2EE" : ""}
                </p>
              </div>
              <button
                type="button"
                data-testid={`template-delete-${template.id}`}
                onClick={() => deleteMutation.mutate(template.id)}
                disabled={deleteMutation.isPending}
                className="text-xs underline disabled:opacity-50 shrink-0"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
