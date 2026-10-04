# Artifact Hub — Write-up

## What I built and why

_To be written (step 28)._

## What I chose not to build, and why

### A sweeper that scales past one volume

An hourly sweeper removes what the app leaves behind: files of failed uploads, drafts never uploaded, expired upload links and idempotency keys. To find unused files it lists the stored files and checks them against the database, 500 at a time.

With the local storage driver, listing reads the whole folder tree into memory before it checks the first file. That is fine at the size this app runs at: each version is one file, so thousands of artifacts mean an array of a few hundred kilobytes and about a second of work, once an hour. It would not be fine with hundreds of thousands of files, where memory and run time grow with the total on every sweep.

I left it that way on purpose: within a two-day time box, the time went to the flows reviewers use, not to a scale the demo will never reach. The way forward is known:

- **Stream the local listing** (Node's `opendir` with `recursive: true`), so memory stays at one batch however many files there are. The `StorageDriver.list` interface is already a stream, so nothing else changes.
- **Move to object storage** (S3 or Azure, already behind the `StorageDriver` interface). Their list APIs are paged by design, and lifecycle rules can expire leftovers without a sweep at all. This is also what horizontal scaling needs, since a local volume pins the app to one replica.

## Architecture overview

_To be written (step 28)._

## How the MCP integration works

_To be written (step 28)._

## Where and why I used LLM capabilities

_To be written (step 28)._

## Deployment approach

_To be written (step 28)._

## What I'd do next with another week

_To be written (step 28)._
