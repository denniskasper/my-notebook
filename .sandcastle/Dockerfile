FROM node:24-bookworm

# Install system dependencies
RUN apt-get update && apt-get install -y \
  git \
  curl \
  jq \
  && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && apt-get update && apt-get install -y gh \
  && rm -rf /var/lib/apt/lists/*

# Postgres 18 (PGDG) for integration tests. No system cluster: the agent user
# owns its own data directory (below), so no sudo is needed to start it.
RUN apt-get update && apt-get install -y postgresql-common ca-certificates \
  && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y \
  && sed -i 's/^#\?\s*create_main_cluster.*/create_main_cluster = false/' /etc/postgresql-common/createcluster.conf \
  && apt-get install -y postgresql-18 \
  && rm -rf /var/lib/apt/lists/*
ENV PATH="/usr/lib/postgresql/18/bin:$PATH"

# pnpm via corepack (version pinned by "packageManager" in package.json)
RUN corepack enable

# Build-args for UID/GID alignment: sandcastle docker build-image
# defaults these to the host user's UID/GID so image-built files
# and bind-mounted files share an owner without runtime chown.
ARG AGENT_UID=1000
ARG AGENT_GID=1000

# Rename the base image's "node" user to "agent" and align UID/GID.
RUN groupmod -o -g $AGENT_GID node && usermod -o -u $AGENT_UID -g $AGENT_GID -d /home/agent -m -l agent node
USER ${AGENT_UID}:${AGENT_GID}

# Install Claude Code CLI
RUN curl -fsSL https://claude.ai/install.sh | bash

# Add Claude to PATH
ENV PATH="/home/agent/.local/bin:$PATH"

WORKDIR /home/agent

# The agent's Postgres cluster with the dev and _test databases. The sandbox
# hook starts it (pg_ctl) before the agent runs; the app reads the URLs below.
ENV PGDATA=/home/agent/pgdata
ENV DATABASE_URL=postgres://postgres@localhost:5432/my_notebook
ENV TEST_DATABASE_URL=postgres://postgres@localhost:5432/my_notebook_test
RUN initdb --username=postgres --auth=trust --encoding=UTF8 --locale=C.UTF-8 \
  && echo "unix_socket_directories = '/tmp'" >> "$PGDATA/postgresql.conf" \
  && echo "listen_addresses = 'localhost'" >> "$PGDATA/postgresql.conf" \
  && pg_ctl -w -l /tmp/initdb.log start \
  && createdb -h localhost -U postgres my_notebook \
  && createdb -h localhost -U postgres my_notebook_test \
  && pg_ctl -w stop

# In worktree sandbox mode, Sandcastle bind-mounts the git worktree at /home/agent/workspace
# and overrides the working directory to /home/agent/workspace at container start.
# Structure your Dockerfile so that /home/agent/workspace can serve as the project root.
ENTRYPOINT ["sleep", "infinity"]
