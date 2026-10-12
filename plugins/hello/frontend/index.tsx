// hello test plugin UI — minimal page so the backend menu path resolves.
export const routes = [
  {
    path: '/hello',
    element: (
      <div>
        <h2>Hello plugin</h2>
        <p>Test plugin loaded without core edits. Backend: /api/v1/plugins/hello/hello</p>
      </div>
    ),
  },
];
