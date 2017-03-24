<template>
<div>
    <input ref="input" v-on:focusout="onFocusLost" v-bind:class="{'ma-failure': showValidationWarnings && !isValid}" v-bind:aria-describedby="id" type="text" v-model="fields[fieldName].value" v-bind:placeholder="placeholder"/>
    <p v-show="showValidationWarnings && !isValid" class="help-text" v-bind:id="id">{{maketext("This field is mandatory")}}</p>
</div>
</template>

<script>
/* global $ */
import MetaFieldMixin from '../../../mixins/MetaFieldMixin.vue';
export default {
    mixins: [MetaFieldMixin],
    props: ["placeholder"],
    methods: {
        onFocusLost() {
            this.showValidationWarnings = true;
        },
        focus() {
            $(this.$refs.input).focus();
        }
    }
};
</script>

<style lang="sass">
</style>
