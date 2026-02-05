              {newProjectOpen && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center theme-overlay backdrop-blur-sm p-4"
                  onClick={() => setNewProjectOpen(false)}
                  role="dialog"
                  aria-label="New project"
                >
                  <form
                    onSubmit={handleCreateProject}
                    className="glass-strong w-full max-w-md rounded-2xl p-6 shadow-xl animate-scale-in"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h3 className="text-lg font-semibold theme-text">New project</h3>
                    <p className="mt-1 text-sm theme-text-muted">Group tasks under a project.</p>
                    <div className="mt-4">
                      <label className="block text-sm font-medium theme-text-muted">Name</label>
                      <input
                        type="text"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="e.g. Q1 Launch"
                        className="mt-1 w-full rounded-2xl theme-input px-4 py-2.5"
                        required
                      />
                    </div>
                    <div className="mt-3">
                      <label className="block text-sm font-medium theme-text-muted">Description (optional)</label>
                      <input
                        type="text"
                        value={newProjectDesc}
                        onChange={(e) => setNewProjectDesc(e.target.value)}
                        placeholder="Short description"
                        className="mt-1 w-full rounded-2xl theme-input px-4 py-2.5"
                      />
                    </div>
                    <div className="mt-4 flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setNewProjectOpen(false)}
                        className="rounded-2xl border theme-border px-4 py-2 text-sm theme-text-muted theme-surface-hover-bg hover:theme-text"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={creatingProject || !newProjectName.trim()}
                        className="rounded-2xl theme-surface-bg theme-border border px-4 py-2 text-sm font-medium theme-text theme-surface-hover-bg disabled:opacity-50"
                      >
                        {creatingProject ? 'Creating…' : 'Create'}
                      </button>
                    </div>
                  </form>
                </div>
              )}
