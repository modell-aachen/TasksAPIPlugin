<template>
    <div ref="description" class="description" v-bind:class="{all: expandText}">
        <p v-html="content"></p>
        <div v-if="showReadMore" class="show-more">
            <span class="button hollow secondary" v-on:click="toggleExpandText">
                {{maketext(expandText ? "Show less" : "Show more")}}
            </span>
        </div>
    </div>
</template>

<script>
import TaskPanelMixin from "../../../mixins/TaskPanelMixin.vue";

/* global $ */
export default {
    mixins: [TaskPanelMixin],
    props: ['content'],
    data() {
        return {
            expandText: false,
            showReadMore: false,
        };
    },
    watch: {
        content: 'descriptionHeightExeeded'
    },
    computed: {
        readMore() {
            let text = this.content;
            if(!this.expandText && text.length > this.showChar) {
                let content = text.substring(0, this.showChar);
                this.showReadMore = true;
                return content;
            } else if (text.length > this.showChar) {
                this.showReadMore = true;
                return text;
            }
            this.showReadMore = false;
            return text;
        },
        readAll() {
            let text = this.content;
            if(this.showReadMore) {
                return text.substring(this.showChar, text.length - this.showChar);
            }
        },
    },
    methods: {
        toggleExpandText() {
            this.expandText = !this.expandText;
        },
        descriptionHeightExeeded() {
            this.expandText = false;
            this.$nextTick(function() {
                let maxHeight = $(this.$refs.description).css('max-height').split('px')[0];
                let height = $(this.$refs.description).height();
                if(height == maxHeight){
                    this.showReadMore = true;
                } else {
                    this.showReadMore = false;
                }
            });
        }
    },
    mounted() {
        this.descriptionHeightExeeded();
    }
};
</script>

<style lang="sass">
.description {
    position: relative;
    margin-bottom: 20px;
	overflow: hidden;
	max-height: 250px;
    p {
        display: inline;
    }
    .show-more {
		position: absolute;
        padding: 6px;
        height: 53px;
        bottom: 0;
        width: 100%;
        text-align: center;
        margin: 0;
		background-color: white;
        .button {
            margin-top: 12px;
            padding: 9px 10px;
            font-size: 14px;
        }
    }
    &.all {
        .show-more {
            postion: relative;
        }
        max-height: 99999px;
        overflow: overlay;
    }
}
</style>
