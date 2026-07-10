# Deploy a Node.js App with CloudFormation + Ansible + GitHub Actions

This is a **working, minimal version** of the project ChatGPT described. Follow the steps
in order. Don't skip ahead — each step depends on the one before it.

**What you'll build:** push code to GitHub → GitHub Actions spins up a CloudFormation stack
(VPC, subnet, security group, EC2) → Ansible configures that EC2 (Docker + NGINX) → your
Node.js app gets built and run in a container → NGINX proxies port 80 to it.

---

## 0. Prerequisites (do this once)

- An AWS account, region **ap-south-1** (Mumbai) — matches the template below.
- AWS CLI installed on your laptop: `aws --version`. If missing, install it and run
  `aws configure` with an IAM user's access key (see step 1).
- A GitHub account and a new empty repository, e.g. `aws-devops-project`.
- Git installed locally.

---

## 1. Create an IAM user for GitHub Actions to use

GitHub Actions needs AWS credentials to create resources on your behalf.

1. Go to AWS Console → IAM → Users → **Create user** → name it `github-actions-deployer`.
2. Attach these permissions (easiest for learning — tighten later):
   - `AmazonEC2FullAccess`
   - `AWSCloudFormationFullAccess`
   - `IAMFullAccess` (only needed because our template could add IAM resources later)
3. Go to the user → **Security credentials** → **Create access key** → choose
   "Command Line Interface (CLI)" → save the **Access Key ID** and **Secret Access Key**
   somewhere safe. You'll need them in Step 4.

---

## 2. Create an EC2 key pair (for SSH / Ansible)

Run this once from your laptop (or AWS Console → EC2 → Key Pairs → Create key pair):

```bash
aws ec2 create-key-pair \
  --key-name devops-project-key \
  --region ap-south-1 \
  --query 'KeyMaterial' \
  --output text > devops-project-key.pem

chmod 400 devops-project-key.pem
```

Keep `devops-project-key.pem` safe — you'll paste its contents into a GitHub secret in Step 4.
**Do not commit this file to GitHub.**

---

## 3. Project structure

Copy all the files below into a folder and push it to your GitHub repo:

```
aws-devops-project/
├── app/
│   ├── index.js
│   ├── package.json
│   └── Dockerfile
├── cloudformation/
│   └── main.yml
├── ansible/
│   ├── ansible.cfg
│   ├── inventory.ini
│   └── playbook.yml
└── .github/
    └── workflows/
        └── deploy.yml
```

(All these files are provided alongside this guide — just copy them in as-is.)

Push it:

```bash
cd aws-devops-project
git init
git add .
git commit -m "Initial project setup"
git branch -M main
git remote add origin https://github.com/<your-username>/aws-devops-project.git
git push -u origin main
```

Don't worry that this first push will fail the pipeline (no secrets configured yet) —
that's expected, fix that next.

---

## 4. Add GitHub Secrets

In your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**.
Add these four:

| Secret name | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | from Step 1 |
| `AWS_SECRET_ACCESS_KEY` | from Step 1 |
| `EC2_KEY_NAME` | `devops-project-key` (just the name, from Step 2) |
| `EC2_SSH_PRIVATE_KEY` | full contents of `devops-project-key.pem`, including the `-----BEGIN...` and `-----END...` lines |

---

## 5. Understand what each file does (read before running)

- **`cloudformation/main.yml`** — creates a VPC, public subnet, internet gateway, route
  table, a security group opening ports 22/80/3000, and one EC2 instance. Its `UserData`
  installs Python3 on boot (Ansible needs Python on the target machine to run modules).
- **`ansible/playbook.yml`** — connects to that EC2 over SSH and: installs Docker, installs
  NGINX, writes an NGINX reverse-proxy config (port 80 → 127.0.0.1:3000), copies your app
  code over, builds the Docker image, and runs the container.
- **`.github/workflows/deploy.yml`** — the pipeline. On every push to `main` it: deploys/updates
  the CloudFormation stack, reads the EC2's public IP from the stack outputs, waits for SSH
  to come up, writes a dynamic Ansible inventory with that IP, then runs the playbook, then
  curls the app to confirm it's alive.

---

## 6. Run it

Just push a commit — the workflow triggers automatically on push to `main`:

```bash
git commit --allow-empty -m "Trigger pipeline"
git push
```

Go to your repo → **Actions** tab → watch the `Deploy to AWS` workflow run, step by step.
The first run takes 3–5 minutes (VPC + EC2 creation, then Ansible configuration).

When it finishes, the log for "Get EC2 public IP from stack outputs" shows the IP.
Open `http://<that-ip>` in your browser — you should see:

```
Hello Sourav! Deployed via CloudFormation + Ansible + GitHub Actions 🚀
```

---

## 7. Common failures & fixes

- **"UnauthorizedOperation" during CloudFormation deploy** → your IAM user is missing a
  permission. Re-check Step 1.
- **Ansible step fails with "Permission denied (publickey)"** → the `EC2_SSH_PRIVATE_KEY`
  secret doesn't match the key pair named in `EC2_KEY_NAME`, or you pasted it with
  extra/missing newlines. Re-copy the `.pem` file contents exactly.
- **"dnf: command not found" in playbook** → the AMI in `cloudformation/main.yml` isn't
  Amazon Linux 2023. AMI IDs are region + time specific — re-check the AMI ID for
  `ap-south-1` in EC2 Console → Launch Instance → Amazon Linux 2023 (or ask me, I'll pull
  the current one for you).
- **Smoke test curl fails** → SSH into the box (`ssh -i devops-project-key.pem ec2-user@<ip>`)
  and run `docker ps` to confirm the container is running, and `sudo systemctl status nginx`.

---

## 8. Clean up (important — avoid ongoing AWS charges)

```bash
aws cloudformation delete-stack --stack-name devops-project-stack --region ap-south-1
```

This tears down the VPC, subnet, security group, and EC2 instance.

---

## 9. Where this maps to the "enterprise" diagram ChatGPT showed you

- CloudFormation = the IaC layer (creates AWS resources)
- Ansible = the configuration layer (installs software, deploys the app)
- GitHub Actions = the orchestrator that calls both, in order, on every push

Once this works end-to-end, natural next steps: swap the single EC2 for an Auto Scaling
Group + Application Load Balancer, move secrets to AWS Systems Manager Parameter Store
instead of GitHub Secrets, and split Ansible into roles (you already have the folder
structure for that — `ansible/roles/`).
