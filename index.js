import React, { Component } from 'react'
import { WebView, StyleSheet } from 'react-native'
import PropTypes from 'prop-types'

import htmlContent from './injectedHtml'
import injectedSignaturePad from './injectedJavaScript/signaturePad'
import injectedApplication from './injectedJavaScript/application'
import injectedErrorHandler from './injectedJavaScript/errorHandler'
import injectedExecuteNativeFunction from './injectedJavaScript/executeNativeFunction'

class SignaturePad extends Component {
  constructor(props) {
    super(props)
    const { backgroundColor } = StyleSheet.flatten(props.style)
    const injectedJavaScript = injectedExecuteNativeFunction
      + injectedErrorHandler
      + injectedSignaturePad
      + injectedApplication(props.penColor, backgroundColor, props.dataURL)
    const html = htmlContent(injectedJavaScript)
    this.source = { html } // We don't use WebView's injectedJavaScript because on Android,
    // the WebView re-injects the JavaScript upon every url change. Given that we use url changes
    // to communicate signature changes to the React Native app, the JS is re-injected every time
    // a stroke is drawn.
    this.onNavigationChange = this.onNavigationChange.bind(this)
    this.parseMessageFromWebViewNavigationChange
      = this.parseMessageFromWebViewNavigationChange.bind(this)
    this.attemptToExecuteNativeFunctionFromWebViewMessage
      = this.attemptToExecuteNativeFunctionFromWebViewMessage.bind(this)
  }

  onNavigationChange(args) {
    this.parseMessageFromWebViewNavigationChange(unescape(args.url))
  }

  parseMessageFromWebViewNavigationChange(newUrl) {
    // Example input:
    // applewebdata://4985ECDA-4C2B-4E37-87ED-0070D14EB985#executeFunction=jsError&arguments=%7B%22message%22:%22ReferenceError:%20Can't%20find%20variable:%20WHADDUP%22,%22url%22:%22applewebdata://4985ECDA-4C2B-4E37-87ED-0070D14EB985%22,%22line%22:340,%22column%22:10%7D"
    // All parameters to the native world are passed via a hash url where every parameter is passed
    // as &[ParameterName]<-[Content]&
    const hashUrlIndex = newUrl.lastIndexOf('#')
    if (hashUrlIndex === -1) {
      return
    }

    let hashUrl = newUrl.substring(hashUrlIndex)
    hashUrl = decodeURIComponent(hashUrl)
    const regexFindAllSubmittedParameters = /&(.*?)&/g

    let parameters = {}
    let parameterMatch = regexFindAllSubmittedParameters.exec(hashUrl)
    if (!parameterMatch) {
      return
    }

    while (parameterMatch) {
      const parameterPair = parameterMatch[1] // For example executeFunction=jsError or
      // arguments=...

      const parameterPairSplit = parameterPair.split('<-')
      if (parameterPairSplit.length === 2) {
        const key = parameterPairSplit[0]
        const value = parameterPairSplit[1]
        const reconstructParameters = {
          ...parameters,
          [key]: value,
        }
        parameters = reconstructParameters
      }

      parameterMatch = regexFindAllSubmittedParameters.exec(hashUrl)
    }

    if (!this.attemptToExecuteNativeFunctionFromWebViewMessage(parameters)) {
      console.warn({ parameters, hashUrl }, 'Received an unknown set of parameters from WebView')
    }
  }

  attemptToExecuteNativeFunctionFromWebViewMessage = (message) => {
    if (message.executeFunction && message.arguments) {
      const parsedArguments = JSON.parse(message.arguments)

      const referencedFunction = this[`bridged${message.executeFunction}`]
      if (typeof referencedFunction === 'function') {
        referencedFunction.apply(this, [parsedArguments])
        return true
      }
    }

    return false
  }

  bridgedjsError = (args) => {
    this.props.onError({ details: args })
  }

  bridgedfinishedStroke({ base64DataUrl }) {
    this.props.onChange({ base64DataUrl })
  }

  renderError(args) {
    this.props.onError({ details: args })
  }

  render() {
    return (
      <WebView
        automaticallyAdjustContentInsets={false}
        javaScriptEnabled
        onNavigationStateChange={this.onNavigationChange}
        renderError={this.renderError}
        renderLoading={this.renderLoading}
        source={this.source}
        style={this.props.style}
      />
    )
  }
}

SignaturePad.propTypes = {
  onChange: PropTypes.func,
  onError: PropTypes.func,
  style: PropTypes.oneOfType([
    PropTypes.array,
    PropTypes.number,
    PropTypes.object,
  ]),
  penColor: PropTypes.string,
  dataURL: PropTypes.string,
}

SignaturePad.defaultProps = {
  onChange: () => {},
  onError: () => {},
  style: {},
  penColor: '#000',
  dataURL: '',
}

export default SignaturePad
