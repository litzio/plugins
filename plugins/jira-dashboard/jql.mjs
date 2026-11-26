export const schema = {
  project: ["Project", "project"], assignee: ["Assignee", "assignee"], reporter: ["Reporter", "reporter"],
  status: ["Status", "status"], priority: ["Priority", "priority"], type: ["Issue type", "issuetype"],
  label: ["Label", "labels"], id: ["Issue key", "key"], summary: ["Keyword", "text"],
  created: ["Created", "created"], updated: ["Updated", "updated"], resolved: ["Resolved", "resolutiondate"],
  due: ["Due", "duedate"],
};
export const dateFields = ["created", "updated", "resolved", "due"];
const quote = value => JSON.stringify(value);
export function whereJql(filters, live = false) {
  const countConditions = {
    active: 'statusCategory = "In Progress"', unresolved: "resolution IS EMPTY",
    resolved: "resolution IS NOT EMPTY", overdue: "resolution IS EMPTY AND duedate < startOfDay()",
    assigned: "assignee = currentUser()",
  };
  const parts = Object.entries(filters).flatMap(([field, values]) => {
    if (!values.length) return [];
    if (field === "metric") return [countConditions[values[0]]];
    const name = schema[field][1];
    if (field === "summary") {
      const term = values[0];
      return [live && /^[A-Z][A-Z0-9_]*-\d+$/i.test(term) ? "key = " + quote(term.toUpperCase()) : name + " ~ " + quote(term)];
    }
    if (dateFields.includes(field)) {
      const [from, to] = values;
      const nextDay = live && field !== "due" && to && new Date(Date.parse(to) + 86_400_000).toISOString().slice(0, 10);
      return [from && name + " >= " + quote(from),
        to && (nextDay ? name + " < " + quote(nextDay) : name + " <= " + quote(to))].filter(Boolean);
    }
    if (values.length === 1) return [name + " = " + quote(values[0])];
    return [name + " IN (" + values.map(quote).join(", ") + ")"];
  });
  return parts.join(" AND ");
}

export function createJql(filters, sort, live = false) {
  const where = whereJql(filters, live);
  return (where ? where + " " : "") + "ORDER BY " + schema[sort.field][1] + " " + sort.direction;
}
