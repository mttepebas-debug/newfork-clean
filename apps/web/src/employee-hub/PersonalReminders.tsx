import type { EmployeePersonalTaskInput } from "@newfork/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListTodo, Plus, CircleCheck, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import {
  changeEmployeePersonalTask,
  getEmployeePersonalTasks,
} from "./employee-hub-data";
import { CardHeading } from "./DashboardPrimitives";
import { LinesOutline, LoadError, RefreshError } from "../shell/LoadState";
import { FieldNote } from "../shell/FieldNote";
export function PersonalTasks({
  workspaceId,
  employeeId,
  online,
}: {
  workspaceId: string;
  employeeId: string;
  online: boolean;
}) {
  const client = useQueryClient();
  const [title, setTitle] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [message, setMessage] = useState("");
  const attempt = useRef<{ id: string; title: string } | null>(null);
  const key = ["employee-personal-tasks", workspaceId, employeeId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => getEmployeePersonalTasks(workspaceId),
    refetchInterval: 60_000,
  });
  const mutation = useMutation({
    onMutate: () => client.cancelQueries({ queryKey: key }),
    mutationFn: (input: EmployeePersonalTaskInput) =>
      changeEmployeePersonalTask(workspaceId, input),
    onSuccess: (tasks, input) => {
      client.setQueryData(key, tasks);
      setMessage(
        input.action === "create"
          ? "Reminder added."
          : input.action === "delete"
            ? "Reminder removed."
            : input.action === "complete"
              ? "Reminder completed."
              : "Reminder reopened.",
      );
      if (input.action === "create") {
        setTitle("");
        attempt.current = null;
      }
    },
  });
  const tasks = query.data ?? [];
  const open = tasks.filter((item) => !item.completed);
  const visible = showCompleted ? tasks : expanded ? open : open.slice(0, 3);
  return (
    <section className="eh-card eh-tasks">
      <CardHeading title="My reminders" icon={<ListTodo size={18} />} />
      <p className="eh-section-description">
        Just for you. Saved across your devices.
      </p>
      {query.isError && query.data ? (
        <RefreshError
          message="Your reminders didn't refresh. These are the last ones that loaded."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.isError && !query.data ? (
        <LoadError
          inset
          level={3}
          title="We couldn't load your reminders"
          detail="Your reminders didn't load. Nothing was changed."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : query.isPending ? (
        online ? (
          <LinesOutline label="Loading your reminders" lines={3} />
        ) : (
          <p className="eh-empty">Connect to load your reminders.</p>
        )
      ) : (
        <>
          <form
            className="eh-task-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!title.trim() || mutation.isPending || !online) return;
              if (attempt.current?.title !== title.trim())
                attempt.current = {
                  id: crypto.randomUUID(),
                  title: title.trim(),
                };
              mutation.mutate({ action: "create", ...attempt.current });
            }}
          >
            <input
              aria-label="New personal reminder"
              placeholder="Add a little reminder…"
              maxLength={160}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <button
              type="submit"
              className="eh-icon-button"
              aria-label="Add reminder"
              disabled={!title.trim() || mutation.isPending || !online}
            >
              <Plus size={20} />
            </button>
          </form>
          <div className="eh-task-list">
            {visible.map((item) => (
              <div
                key={item.id}
                className={item.completed ? "is-completed" : ""}
              >
                <label>
                  <input
                    type="checkbox"
                    checked={item.completed}
                    disabled={mutation.isPending || !online}
                    onChange={() =>
                      mutation.mutate({
                        id: item.id,
                        action: item.completed ? "reopen" : "complete",
                      })
                    }
                  />
                  <span>{item.title}</span>
                </label>
                {item.completed && (
                  <button
                    className="eh-icon-button"
                    aria-label={`Remove ${item.title}`}
                    disabled={mutation.isPending || !online}
                    onClick={() =>
                      mutation.mutate({ action: "delete", id: item.id })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {!visible.length && (
            <div className="eh-tasks-empty">
              <CircleCheck size={23} />
              <p>
                {showCompleted
                  ? "Your list is ready for a fresh start."
                  : "Nothing on your list. Add a reminder for later."}
              </p>
            </div>
          )}
          <div className="eh-task-tools">
            {open.length > 3 && !showCompleted && (
              <button onClick={() => setExpanded(!expanded)}>
                {expanded ? "Show less" : `View all ${open.length}`}
              </button>
            )}
            {tasks.some((item) => item.completed) && (
              <button onClick={() => setShowCompleted(!showCompleted)}>
                {showCompleted ? "Hide completed" : "Show completed"}
              </button>
            )}
          </div>
        </>
      )}
      {!online && query.data && (
        <p className="eh-section-description" role="status">
          Connect to save changes to your reminders.
        </p>
      )}
      <FieldNote
        id="personal-reminders"
        error={mutation.isError ? `${mutation.error.message} Your change hasn’t been confirmed.` : null}
      />
      <span className="sr-only" role="status">
        {message}
      </span>
    </section>
  );
}
