# Deploying ClipSnare to Docker Hub

This guide explains how to build, tag, and push the ClipSnare Docker image to Docker Hub.

## Prerequisites

- A [Docker Hub](https://hub.docker.com/) account.
- Docker installed and running on your machine.

## Step-by-Step Instructions

### 1. Log in to Docker Hub

Open your terminal and authenticate with your Docker Hub credentials:

```bash
docker login
```

### 2. Build the Docker Image

Build the image locally. Replace `your-username` with your actual Docker Hub username.

```bash
docker build -t your-username/clipsnare:latest .
```

*Note: The `.` at the end refers to the current directory where the `Dockerfile` is located.*

### 3. Tag the Image (Optional if done in step 2)

If you already built an image with a local tag (e.g., `clipsnare:latest`), you can tag it for Docker Hub:

```bash
docker tag clipsnare:latest your-username/clipsnare:latest
```

### 4. Push to Docker Hub

Upload the image to your repository:

```bash
docker push your-username/clipsnare:latest
```

### 5. Verify the Push

Once the push is complete, you can visit your [Docker Hub profile](https://hub.docker.com/repositories) to see the newly uploaded image.

## Running the Image from Docker Hub

Anyone (or yourself on another machine) can now run ClipSnare by pulling it directly from Docker Hub:

```bash
docker run -p 5173:5173 your-username/clipsnare:latest
```

## Automating with GitHub Actions (Optional)

For more advanced setups, you can create a `.github/workflows/docker-publish.yml` file to automatically push to Docker Hub whenever you push code to your `main` branch.
