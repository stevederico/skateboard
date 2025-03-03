# Use an official Node runtime as a parent image
FROM denoland/deno:2.1.4

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (or use yarn.lock if using yarn)
COPY package*.json ./

# Install any needed packages
RUN deno install

# Bundle app source inside the Docker image
COPY index.js ./

# Change ownership of the working directory to the 'node' user
RUN chown -R deno:deno /usr/src/app

# Switch to 'node' user
USER deno

# Define environment variable
ENV PORT=3001
ENV NODE_ENV=production

EXPOSE 3001
# Run the app when the container launches
CMD ["deno", "run","--allow-all", "--unstable-cron", "index.js"] 
