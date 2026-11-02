// Builds the CPAS fork image and pushes it to harbor.k8ssb.cpas.cz/sourcebot/sourcebot.
// Tags: short commit SHA on every build, plus the Git tag (e.g. v4.17.4-cpas.1) on tag builds.
String gitProxy = 'http://proxyns.cpas.cz:8080'

properties([
    disableConcurrentBuilds(),
])

node('docker') {
    String commit

    stage('Checkout') {
        checkout scm
        // vendor/zoekt is a GitHub submodule; agents reach GitHub only through the corporate proxy.
        sh "git -c http.proxy=${gitProxy} submodule update --init vendor/zoekt"
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
