// Builds the CPAS fork image and pushes it to harbor.k8ssb.cpas.cz/sourcebot/sourcebot.
// Tag builds (e.g. v4.17.4-cpas.1) always publish; branch builds publish only with PUBLISH_IMAGE.
// Image tags: short commit SHA, plus the Git tag on tag builds.
// DEPLOY_TO_AT sets the published image in K8S/sourcebot (branch at) through the argo-deploy job.
String gitProxy = 'http://proxyns.cpas.cz:8080'

properties([
    disableConcurrentBuilds(),
    parameters([
        booleanParam(
            name: 'PUBLISH_IMAGE',
            defaultValue: false,
            description: 'Build and push the image to Harbor. Tag builds always publish.',
        ),
        booleanParam(
            name: 'DEPLOY_TO_AT',
            defaultValue: env.TAG_NAME != null,
            description: 'Deploy the published image to sourcebot-at through argo-deploy. Defaults to true on tag builds.',
        ),
    ]),
])

// params are null on the first build, before Jenkins registers them.
boolean publish = env.TAG_NAME || params.PUBLISH_IMAGE == true
boolean deploy = params.DEPLOY_TO_AT == null ? env.TAG_NAME != null : params.DEPLOY_TO_AT
if (!publish) {
    echo 'Image publishing skipped; build a tag or run with PUBLISH_IMAGE to push an image.'
    currentBuild.result = 'NOT_BUILT'
    return
}

String imageVersion

node('docker') {
    String commit

    stage('Checkout') {
        checkout scm
        // vendor/zoekt is a GitHub submodule; agents reach GitHub only through the corporate proxy.
        sh "git -c http.proxy=${gitProxy} submodule update --init vendor/zoekt"
        // The agent's umask leaves checked-out files unreadable for others, and COPY keeps those modes.
        // The container runs as a non-root user, so root-owned files such as entrypoint.sh must be world-readable.
        sh 'chmod -R a+rX .'
        commit = sh(script: 'git rev-parse HEAD', returnStdout: true).trim()
    }

    stage('Build & Push') {
        List<String> imageTags = [commit.substring(0, 12)]
        if (env.TAG_NAME) {
            imageTags << env.TAG_NAME
        }
        imageVersion = imageTags.last()
        pushDockerImage({
            project = 'sourcebot'
            name = 'sourcebot'
            tags = imageTags
            cluster = 'k8ssb'
            buildArgs = "--build-arg NEXT_PUBLIC_BUILD_COMMIT_SHA=${commit}"
        })
    }
}

stage('Deploy to AT') {
    if (!deploy) {
        echo 'DEPLOY_TO_AT=false; skipping argo-deploy.'
        return
    }
    build job: 'argo-deploy',
        parameters: [
            string(name: 'VERSION', value: imageVersion),
            string(name: 'SELECTOR', value: 'sourcebot.sourcebot.image.tag'),
            string(name: 'FILE', value: 'values-beta-at.yaml'),
            string(name: 'BRANCH', value: 'at'),
            string(name: 'REPOSITORY', value: 'git.cpas.cz/scm/k8s/sourcebot.git'),
        ]
    currentBuild.description = "deployed ${imageVersion} to sourcebot-at"
}
