/*

File copied from https://github.com/maptiler/maptiler-sdk-js/blob/c5c7a343dcf4083a5eca75ede319991b80fcb652/src/Map.ts#L579

BSD 3-Clause License

Copyright (c) 2022, MapTiler
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

*/

/**
 * Transform style layers to force labels in a specific language.
 * @param {Array} layers Layers that must be transformed.
 * @param {string} language Target language code.
 */
// prettier-ignore
export default function translateLayers(layers, language) {
  /* eslint-disable */

  // detects pattern like "{name:somelanguage}" with loose spacing
  const strLanguageRegex = /^\s*{\s*name\s*(:\s*(\S*))?\s*}$/;

  // detects pattern like "name:somelanguage" with loose spacing
  const strLanguageInArrayRegex = /^\s*name\s*(:\s*(\S*))?\s*$/;

  // for string based bilingual lang such as "{name:latin}  {name:nonlatin}" or "{name:latin}  {name}"
  const strBilingualRegex =
    /^\s*{\s*name\s*(:\s*(\S*))?\s*}(\s*){\s*name\s*(:\s*(\S*))?\s*}$/;

  // Regex to capture when there are more info, such as mountains elevation with unit m/ft
  const strMoreInfoRegex = /^(.*)({\s*name\s*(:\s*(\S*))?\s*})(.*)$/;

  const langStr = language ? `name:${language}` : "name"; // to handle local lang
  const replacer = [
    "case",
    ["has", langStr],
    ["get", langStr],
    ["get", "name"],
  ];

  for (let i = 0; i < layers.length; i += 1) {
    const layer = layers[i];
    const layout = layer.layout;

    if (!layout) {
      continue;
    }

    if (!layout["text-field"]) {
      continue;
    }

    const textFieldLayoutProp = this.getLayoutProperty(
      layer.id,
      "text-field"
    );

    // Note:
    // The value of the 'text-field' property can take multiple shape;
    // 1. can be an array with 'concat' on its first element (most likely means bilingual)
    // 2. can be an array with 'get' on its first element (monolingual)
    // 3. can be a string of shape '{name:latin}'
    // 4. can be a string referencing another prop such as '{housenumber}' or '{ref}'
    //
    // The case 1, 2 and 3 will be updated while maintaining their original type and shape.
    // The case 3 will not be updated

    let regexMatch;

    // This is case 1
    if (
      Array.isArray(textFieldLayoutProp) &&
      textFieldLayoutProp.length >= 2 &&
      textFieldLayoutProp[0].trim().toLowerCase() === "concat"
    ) {
      const newProp = textFieldLayoutProp.slice(); // newProp is Array
      // The style could possibly have defined more than 2 concatenated language strings but we only want to edit the first
      // The style could also define that there are more things being concatenated and not only languages

      for (let j = 0; j < textFieldLayoutProp.length; j += 1) {
        const elem = textFieldLayoutProp[j];

        // we are looking for an elem of shape '{name:somelangage}' (string) of `["get", "name:somelanguage"]` (array)

        // the entry of of shape '{name:somelangage}', possibly with loose spacing
        if (
          (typeof elem === "string" || elem instanceof String) &&
          strLanguageRegex.exec(elem.toString())
        ) {
          newProp[j] = replacer;
          break; // we just want to update the primary language
        }
        // the entry is of an array of shape `["get", "name:somelanguage"]`
        else if (
          Array.isArray(elem) &&
          elem.length >= 2 &&
          elem[0].trim().toLowerCase() === "get" &&
          strLanguageInArrayRegex.exec(elem[1].toString())
        ) {
          newProp[j] = replacer;
          break; // we just want to update the primary language
        } else if (
          Array.isArray(elem) &&
          elem.length === 4 &&
          elem[0].trim().toLowerCase() === "case"
        ) {
          newProp[j] = replacer;
          break; // we just want to update the primary language
        }
      }

      this.setLayoutProperty(layer.id, "text-field", newProp);
    }

    // This is case 2
    else if (
      Array.isArray(textFieldLayoutProp) &&
      textFieldLayoutProp.length >= 2 &&
      textFieldLayoutProp[0].trim().toLowerCase() === "get" &&
      strLanguageInArrayRegex.exec(textFieldLayoutProp[1].toString())
    ) {
      const newProp = replacer;
      this.setLayoutProperty(layer.id, "text-field", newProp);
    }

    // This is case 3
    else if (
      (typeof textFieldLayoutProp === "string" ||
        textFieldLayoutProp instanceof String) &&
      strLanguageRegex.exec(textFieldLayoutProp.toString())
    ) {
      const newProp = replacer;
      this.setLayoutProperty(layer.id, "text-field", newProp);
    } else if (
      Array.isArray(textFieldLayoutProp) &&
      textFieldLayoutProp.length === 4 &&
      textFieldLayoutProp[0].trim().toLowerCase() === "case"
    ) {
      const newProp = replacer;
      this.setLayoutProperty(layer.id, "text-field", newProp);
    } else if (
      (typeof textFieldLayoutProp === "string" ||
        textFieldLayoutProp instanceof String) &&
      (regexMatch = strBilingualRegex.exec(
        textFieldLayoutProp.toString()
      )) !== null
    ) {
      const newProp = `{${langStr}}${regexMatch[3]}{name${
        regexMatch[4] || ""
      }}`;
      this.setLayoutProperty(layer.id, "text-field", newProp);
    } else if (
      (typeof textFieldLayoutProp === "string" ||
        textFieldLayoutProp instanceof String) &&
      (regexMatch = strMoreInfoRegex.exec(
        textFieldLayoutProp.toString()
      )) !== null
    ) {
      const newProp = `${regexMatch[1]}{${langStr}}${regexMatch[5]}`;
      this.setLayoutProperty(layer.id, "text-field", newProp);
    }
  }

  /* eslint-enable */
}
