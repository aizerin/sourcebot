// Builds the CPAS fork image and pushes it to harbor.k8ssb.cpas.cz/sourcebot/sourcebot.
// Tag builds (e.g. v4.17.4-cpas.1) always publish; branch builds publish only with PUBLISH_IMAGE.
// Image tags: short commit SHA, plus the Git tag on tag builds.
String gitProxy = 'http://proxyns.cpas.cz:8080'

properties([
    disableConcurrentBuilds(),
    parameters([
        booleanParam(
            name: 'PUBLISH_IMAGE',
            defaultValue: false,
            description: 'Build and push the image to Harbor. Tag builds always publish.',
        ),
    ]),
])

// params.PUBLISH_IMAGE is null on the first build, before Jenkins registers the parameter.
boolean publish = env.TAG_NAME || params.PUBLISH_IMAGE == true
if (!publish) {
    echo 'Image publishing skipped; build a tag or run with PUBLISH_IMAGE to push an image.'
    currentBuild.result = 'NOT_BUILT'
    return
}

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
        pushDockerImage({
            project = 'sourcebot'
            name = 'sourcebot'
            tags = imageTags
            cluster = 'k8ssb'
            buildArgs = "--build-arg NEXT_PUBLIC_BUILD_COMMIT_SHA=${commit}"
        })
    }
}
