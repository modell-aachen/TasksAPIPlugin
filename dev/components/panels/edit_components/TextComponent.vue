<template>
<div>
    <input v-on:focusout="onFocusLost" v-bind:class="{'ma-failure': showValidationWarnings && !isValid}" v-bind:aria-describedby="id" type="text" v-model="fields[fieldName].value" v-bind:placeholder="placeholder"/>
    <p v-show="showValidationWarnings && !isValid" class="help-text" v-bind:id="id">Mandatory!</p>
</div>
</template>

<script>
import MetaFieldMixin from '../../../mixins/MetaFieldMixin.vue';
export default {
    mixins: [MetaFieldMixin],
    props: ["placeholder"],
    methods: {
        onFocusLost() {
            this.showValidationWarnings = true;
        }
    }
};
</script>

<style lang="sass">
</style>
